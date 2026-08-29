import { requireAdmin } from "@/lib/auth";
import { sendClientAcceptedNotification, sendClientRefusedNotification } from "@/lib/email";
import { errors } from "@/lib/errors";
import { assertSameOrigin, handle, jsonOk, readJson } from "@/lib/http";
import {
  acceptRequest,
  cancelRequest,
  deleteRequest,
  findRequestById,
  refuseRequest,
  setAdminComment,
  setInternalNote,
  setRequestStatus,
} from "@/lib/requests";
import { transaction } from "@/lib/store";
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/types";
import { cleanString } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson(request);

    const result = await transaction((state) => {
      const existing = findRequestById(state, id);
      if (!existing) throw errors.requestNotFound();
      const previousStatus = existing.status;

      if (body.action === "accept") {
        acceptRequest(state, id);
      } else if (body.action === "refuse") {
        refuseRequest(state, id, typeof body.comment === "string" ? body.comment : undefined);
      } else if (body.action === "cancel") {
        cancelRequest(state, id, typeof body.comment === "string" ? body.comment : undefined);
      } else if (body.status !== undefined) {
        const status = cleanString(body.status, 20) as RequestStatus;
        if (!REQUEST_STATUSES.includes(status)) throw errors.invalidStatus();
        setRequestStatus(state, id, status, typeof body.note === "string" ? body.note : undefined);
      }

      if (body.adminComment !== undefined) {
        setAdminComment(state, id, cleanString(body.adminComment, 1000));
      }
      if (body.internalNote !== undefined) {
        setInternalNote(state, id, cleanString(body.internalNote, 1000));
      }

      const updated = findRequestById(state, id)!;
      const bike = state.bikes.find((b) => b.kind === updated.bikeKind);
      return { request: updated, bikeName: bike?.name ?? updated.bikeKind, previousStatus };
    });

    // Les notifications ne doivent jamais faire echouer l'action admin elle-meme.
    if (result.previousStatus !== result.request.status) {
      if (result.request.status === "accepted") {
        void sendClientAcceptedNotification(result.request, { name: result.bikeName });
      } else if (result.request.status === "refused") {
        void sendClientRefusedNotification(result.request, { name: result.bikeName });
      }
    }

    return jsonOk({ request: result.request });
  });
}

export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    await requireAdmin();
    const { id } = await context.params;

    await transaction((state) => {
      deleteRequest(state, id);
    });

    return jsonOk({ deleted: true });
  });
}
