const boot = async (): Promise<void> => {
  // Worker entrypoint stub for background jobs.
  process.stdout.write("Worker ready\n");
};

boot().catch(() => {
  process.stderr.write("Worker failed to start\n");
  process.exit(1);
});
