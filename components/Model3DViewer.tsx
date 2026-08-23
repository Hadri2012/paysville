"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Aperçu 3D interactif d'un produit (fichier GLB).
 *
 * Trois principes de fonctionnement :
 *
 *  - Chargement à la demande. three.js pèse plusieurs centaines de kilooctets :
 *    il n'est importé qu'au clic sur « Voir en 3D », pour ne pas alourdir une
 *    fiche produit que la plupart des visiteurs regardent sans manipuler le
 *    modèle. Les imports dynamiques restent donc dans l'effet, jamais en tête
 *    de fichier.
 *  - Cadrage automatique. Le modèle est recentré et l'appareil photo reculée
 *    d'après sa boîte englobante : n'importe quel export s'affiche à l'échelle,
 *    sans réglage manuel produit par produit.
 *  - Nettoyage complet au démontage. Le contexte WebGL, les géométries et les
 *    matériaux sont libérés explicitement — sans quoi naviguer entre plusieurs
 *    fiches finirait par épuiser les contextes disponibles du navigateur.
 */
export function Model3DViewer({
  src,
  productName,
}: {
  src: string;
  productName: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    setStatus("loading");

    void (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const { OrbitControls } = await import(
          "three/examples/jsm/controls/OrbitControls.js"
        );
        if (disposed) return;

        const width = mount.clientWidth || 600;
        const height = mount.clientHeight || 420;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);

        // Éclairage neutre : une lumière d'ambiance pour éviter les noirs bouchés,
        // deux directionnelles opposées pour révéler le relief des impressions.
        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(4, 6, 5);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.9);
        fill.position.set(-5, -2, -4);
        scene.add(fill);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;

        const gltf = await new GLTFLoader().loadAsync(src);
        if (disposed) {
          renderer.dispose();
          return;
        }

        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);

        const radius = Math.max(size.x, size.y, size.z) || 1;
        const distance = radius / (2 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(0, radius * 0.25, distance * 2.1);
        camera.near = distance / 100;
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        controls.minDistance = distance * 0.6;
        controls.maxDistance = distance * 6;
        controls.update();

        let frame = 0;
        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
          const w = mount.clientWidth || width;
          const h = mount.clientHeight || height;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        setStatus("ready");

        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          scene.traverse((object) => {
            const mesh = object as { geometry?: { dispose(): void }; material?: unknown };
            mesh.geometry?.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) {
              for (const entry of material) (entry as { dispose(): void }).dispose();
            } else if (material) {
              (material as { dispose(): void }).dispose();
            }
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (error) {
        console.error("[hadrishop] aperçu 3D indisponible", error);
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [open, src]);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary btn-block"
        onClick={() => setOpen(true)}
      >
        🧊 Voir le modèle en 3D
      </button>
    );
  }

  return (
    <div className="model3d">
      <div className="model3d-head">
        <span className="small muted">
          Aperçu 3D de {productName} — faites glisser pour tourner, molette pour zoomer.
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setOpen(false);
            setStatus("idle");
          }}
        >
          Fermer
        </button>
      </div>

      <div className="model3d-stage" ref={mountRef} aria-label={`Modèle 3D de ${productName}`}>
        {status === "loading" ? (
          <div className="model3d-overlay">
            <span className="spinner" aria-hidden="true" /> Chargement du modèle…
          </div>
        ) : null}
        {status === "error" ? (
          <div className="model3d-overlay">
            L&apos;aperçu 3D n&apos;a pas pu être chargé. Les photos du produit restent
            disponibles ci-dessus.
          </div>
        ) : null}
      </div>
    </div>
  );
}
