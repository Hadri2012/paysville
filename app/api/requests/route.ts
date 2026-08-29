import { sendAdminNewRequestNotification, sendClientConfirmation } from "@/lib/email";
import { assertSameOrigin, handle, jsonOk, limit, readJson } from "@/lib/http";
import { createRentalRequest } from "@/lib/requests";
import { transaction } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    limit(request, "create-request", 6, 10 * 60_000);

    const body = await readJson(request);

    const { created, bikeName, adminEmail } = await transaction((state) => {
      const rentalRequest = createRentalRequest(state, body);
      const bike = state.bikes.find((b) => b.kind === rentalRequest.bikeKind);
      return {
        created: rentalRequest,
        bikeName: bike?.name ?? rentalRequest.bikeKind,
        adminEmail: state.settings.contactEmail,
      };
    });

    // Les notifications ne doivent jamais faire echouer la demande elle-meme.
    void sendClientConfirmation(created, { name: bikeName });
    void sendAdminNewRequestNotification(created, { name: bikeName }, adminEmail);

    return jsonOk({
      request: {
        id: created.id,
        number: created.number,
        status: created.status,
      },
    });
  });
}
