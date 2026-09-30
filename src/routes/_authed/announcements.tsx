import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adminAnnouncementAudienceQueryOptions } from "@/lib/queries/admin";
import { adminSendAnnouncement, type AnnouncementResult } from "@/lib/announcements.functions";
import { announcementParagraphs } from "@/lib/announcement-email";
import { requireStaffRoutePermission } from "@/lib/staff-route";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authed/announcements")({
  beforeLoad: ({ context }) =>
    requireStaffRoutePermission(context.queryClient, "announcements.send"),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { data: audience, isLoading } = useQuery(adminAnnouncementAudienceQueryOptions());
  const sendAnnouncement = useServerFn(adminSendAnnouncement);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<AnnouncementResult | null>(null);

  const paragraphs = announcementParagraphs(body);
  const ready = subject.trim().length >= 3 && paragraphs.length > 0 && confirmed;

  async function handleSend() {
    if (!ready) return;
    setSending(true);
    setResult(null);
    try {
      const outcome = await sendAnnouncement({
        data: { subject: subject.trim(), body: body.trim(), confirm: true },
      });
      setResult(outcome);
      if (outcome.dryRun) {
        toast.warning("Nothing was sent: this deployment has no mail key yet.");
      } else if (outcome.failed > 0) {
        toast.warning(`Sent to ${outcome.sent}, ${outcome.failed} failed.`);
      } else {
        toast.success(`Sent to ${outcome.sent} members.`);
        setSubject("");
        setBody("");
        setConfirmed(false);
      }
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't send that update."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-panel border border-porcelain/60 p-5">
        <h2 className="font-serif text-lg text-ink">Write the update</h2>
        <p className="mt-1 text-xs text-stone">
          Blank lines separate paragraphs. Members receive this from Mila's noreply address, so
          replies aren't monitored — point people at the help desk if they need to answer.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="announcement-subject">Subject</Label>
            <Input
              id="announcement-subject"
              className="mt-1.5"
              value={subject}
              maxLength={120}
              placeholder="What's new at Mila"
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea
              id="announcement-body"
              className="mt-1.5 min-h-56"
              value={body}
              maxLength={8000}
              placeholder={
                "We've shipped three things this week.\n\nFaster looks, a new membership page, and a smarter feed."
              }
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="mt-1.5 text-nano uppercase tracking-label text-stone">
              {paragraphs.length} paragraph{paragraphs.length === 1 ? "" : "s"} ·{" "}
              {body.trim().length} characters
            </p>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-stone">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-current"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>
              Send this to {audience ? audience.total : "…"} members. I understand it goes out
              immediately and can't be unsent.
            </span>
          </label>

          <div className="flex items-center gap-3">
            <Button className="gap-1.5" disabled={!ready || sending} onClick={handleSend}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send update
            </Button>
            {isLoading && <span className="text-xs text-stone">Counting members…</span>}
          </div>
        </div>

        {audience && !audience.mailConfigured && (
          <div className="mt-5 flex items-start gap-2.5 rounded-panel border border-destructive/40 px-4 py-3 text-xs text-stone">
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span>
              No mail key on this deployment (<code>RESEND_API_KEY</code>), so sending records the
              update and delivers nothing. Sender: {audience.fromAddress}.
            </span>
          </div>
        )}

        {audience && audience.suspendedSkipped > 0 && (
          <p className="mt-4 text-xs text-stone">
            {audience.suspendedSkipped} suspended account
            {audience.suspendedSkipped === 1 ? " is" : "s are"} skipped.
          </p>
        )}

        {result && (
          <div className="mt-5 rounded-panel border border-porcelain/60 px-4 py-3 text-xs text-stone">
            <strong className="block text-ink">
              {result.dryRun ? "Dry run — nothing delivered" : "Sent"}
            </strong>
            {result.sent} delivered · {result.failed} failed · {result.skipped} skipped ·{" "}
            {result.recipients} recipients
            {result.truncated && " (newest members only this run)"}
            {result.failures.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-panel border border-porcelain/60 p-5">
        <h2 className="font-serif text-lg text-ink">What members see</h2>
        <p className="mt-1 text-xs text-stone">The plain-text version of the email.</p>
        <div className="mt-4 rounded-panel border border-porcelain/60 bg-background/60 p-5">
          <div className="text-nano uppercase tracking-label-xwide text-stone">Mila</div>
          <div className="mt-2 font-serif text-base text-ink">
            {subject.trim() || "Your subject line"}
          </div>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-ink">
            {paragraphs.length === 0 ? (
              <p className="text-stone">Write the message and it appears here.</p>
            ) : (
              paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 12)}`} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))
            )}
          </div>
          <p className="mt-6 border-t border-porcelain/60 pt-3 text-micro leading-relaxed text-stone">
            You're receiving this because you have a Mila account. This is an automated message from
            our noreply address — replies aren't monitored, but the help desk in the app reaches a
            person.
          </p>
        </div>
      </section>
    </div>
  );
}
