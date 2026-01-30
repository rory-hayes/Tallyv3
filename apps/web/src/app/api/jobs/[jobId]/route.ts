import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getJobForFirm } from "@/lib/jobs";

type JobStatusRouteProps = {
  params: { jobId: string };
};

export const GET = async (_request: Request, { params }: JobStatusRouteProps) => {
  const { session } = await requireUser();

  const job = await getJobForFirm(session.firmId, params.jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    type: job.type,
    status: job.status,
    lastError: job.lastError
  });
};
