import Link from "next/link";
import { StatusBadge } from "@/components/OrderDetails";
import { requireAdminPage } from "@/lib/adminGuard";
import { formatPrice } from "@/lib/money";
import { availableStock } from "@/lib/shop";
import { getStore, readState } from "@/lib/store";
import { isStripeConfigured, isWebhookConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tableau de bord" };

export default async function AdminDashboard() {
  await requireAdminPage();
  const state = await readState();
  const { currency, lowStockThreshold } = state.settings;

  const paidOrders = state.orders.filter(
    (order) => order.paymentStatus === "paid" && order.status !== "refunded",
  );
  const revenue = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const recent = [...state.orders]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const preparing = state.orders.filter(
    (order) => order.status === "paid" || order.status === "preparing" || order.status === "ready",
  );

  const live = state.products.filter((p) => !p.archived);
  const activeProducts = live.filter((p) => p.active);
  // Les fichiers téléchargeables n'ont pas de stock : les inclure ici les ferait
  // remonter en « rupture » à tort, sur la seule foi d'un stock resté à zéro.
  const withStock = live
    .filter((product) => product.kind !== "digital")
    .map((product) => ({
      product,
      available: availableStock(state, product),
    }));
  const lowStock = withStock.filter(
    (item) => item.available > 0 && item.available <= lowStockThreshold,
  );
  const outOfStock = withStock.filter((item) => item.available === 0);

  const warnings: string[] = [];
  if (!isStripeConfigured()) {
    warnings.push(
      "La clé secrète Stripe (STRIPE_SECRET_KEY) n'est pas configurée : aucun paiement ne peut aboutir.",
    );
  }
  if (!isWebhookConfigured()) {
    warnings.push(
      "Le secret de webhook Stripe (STRIPE_WEBHOOK_SECRET) n'est pas configuré : la confirmation automatique des paiements est désactivée.",
    );
  }
  if (getStore().driver === "file") {
    warnings.push(
      "Les données sont stockées dans un fichier local (.data/hadrishop.json). Définissez DATABASE_URL pour une base PostgreSQL persistante en production.",
    );
  }
  if (!state.settings.legal.companyName || !state.settings.legal.email) {
    warnings.push(
      "Les informations légales (CGV, confidentialité) sont incomplètes : à compléter dans Paramètres.",
    );
  }
  const emptyDigital = activeProducts.filter(
    (product) => product.kind === "digital" && product.digitalFiles.length === 0,
  );
  if (emptyDigital.length > 0) {
    warnings.push(
      `${emptyDigital.length} produit${emptyDigital.length > 1 ? "s" : ""} numérique${
        emptyDigital.length > 1 ? "s sont visibles sans aucun fichier joint" : " est visible sans aucun fichier joint"
      } (${emptyDigital.map((p) => p.name).join(", ")}) : ${
        emptyDigital.length > 1 ? "ils ne peuvent pas être achetés" : "il ne peut pas être acheté"
      }. Ajoutez les fichiers depuis Produits → Fichiers / 3D.`,
    );
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Tableau de bord Hadrishop</h1>
          <p>Vue d&apos;ensemble de la boutique.</p>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="alert alert-warning">
          <div>
            <strong>À vérifier :</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <section className="stat-grid">
        <div className="stat">
          <div className="label">Chiffre d&apos;affaires</div>
          <div className="value">{formatPrice(revenue, currency)}</div>
          <div className="sub">{paidOrders.length} commande(s) payée(s)</div>
        </div>
        <div className="stat">
          <div className="label">Commandes</div>
          <div className="value">{state.orders.length}</div>
          <div className="sub">toutes commandes confondues</div>
        </div>
        <div className="stat">
          <div className="label">À préparer</div>
          <div className="value">{preparing.length}</div>
          <div className="sub">payées, en préparation ou prêtes</div>
        </div>
        <div className="stat">
          <div className="label">Produits actifs</div>
          <div className="value">{activeProducts.length}</div>
          <div className="sub">{live.length} produit(s) au catalogue</div>
        </div>
        <div className="stat">
          <div className="label">Stock faible</div>
          <div className="value">{lowStock.length}</div>
          <div className="sub">≤ {lowStockThreshold} exemplaire(s)</div>
        </div>
        <div className="stat">
          <div className="label">Rupture de stock</div>
          <div className="value">{outOfStock.length}</div>
          <div className="sub">non commandables</div>
        </div>
      </section>

      <section>
        <div className="page-head">
          <h2>Commandes récentes</h2>
          <Link href="/admin/commandes" className="btn btn-secondary btn-sm">
            Toutes les commandes
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="empty-state">Aucune commande pour le moment.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/commandes/${order.id}`} className="mono">
                        {order.number}
                      </Link>
                    </td>
                    <td>
                      {order.customer.firstName} {order.customer.lastName}
                    </td>
                    <td className="small muted">
                      {new Date(order.createdAt).toLocaleString("fr-BE", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Europe/Brussels",
                      })}
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="num">{formatPrice(order.totalCents, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="detail-grid">
        <div className="card">
          <h3 className="card-title">Stock faible</h3>
          {lowStock.length === 0 ? (
            <p className="muted small">Aucun produit en stock faible.</p>
          ) : (
            <ul className="footer-links">
              {lowStock.map(({ product, available }) => (
                <li key={product.id}>
                  <Link href="/admin/stocks">
                    {product.sku} — {product.name}
                  </Link>{" "}
                  <span className="badge badge-warning">{available} restant(s)</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Rupture de stock</h3>
          {outOfStock.length === 0 ? (
            <p className="muted small">Aucune rupture de stock.</p>
          ) : (
            <ul className="footer-links">
              {outOfStock.map(({ product }) => (
                <li key={product.id}>
                  <Link href="/admin/stocks">
                    {product.sku} — {product.name}
                  </Link>{" "}
                  <span className="badge badge-danger">0</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
