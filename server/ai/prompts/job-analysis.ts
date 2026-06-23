import { registerPrompt } from "./registry";

// User-message builder for automation job-error analysis. The system prompt for
// this task is the compliance system prompt (portal "both").

export function buildJobErrorUserMessage(
  jobType: string,
  errorMessage: string,
  logs: string[] = [],
): string {
  return `Analyze this automation job failure and provide a structured response.

Job Type: ${jobType.replace(/_/g, " ").toUpperCase()}
Error Message: ${errorMessage}
${logs.length > 0 ? `Recent Logs:\n${logs.slice(-5).join("\n")}` : ""}

Respond ONLY as valid JSON with these exact keys:
{
  "summary": "one sentence plain-English summary of what failed",
  "likelyCause": "the most probable root cause",
  "suggestedFix": "step-by-step action to fix it",
  "canRetry": true or false
}`;
}

registerPrompt("jobAnalysis.user", (jobType: string, errorMessage: string, logs: string[]) =>
  buildJobErrorUserMessage(jobType, errorMessage, logs),
);
