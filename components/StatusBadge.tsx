import { REQUEST_STATUS_LABELS, type RequestStatus } from "@/lib/types";

const TONE: Record<RequestStatus, string> = {
  pending: "badge-warning",
  accepted: "badge-success",
  refused: "badge-danger",
  cancelled: "badge-neutral",
  completed: "badge-info",
};

export function StatusBadge({ status, large }: { status: RequestStatus; large?: boolean }) {
  return (
    <span className={`badge badge-dot ${TONE[status]}${large ? " badge-lg" : ""}`}>
      {REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
