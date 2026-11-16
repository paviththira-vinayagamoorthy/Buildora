import { useEffect, useRef, useState } from "react";

import {
  createReportComment,
  getReportComments,
} from "../services/workspaceApi";

import "../styles/ReportComments.css";


function messageFrom(error) {
  return typeof error?.message === "string"
    ? error.message
    : "Unable to complete the request.";
}

function timestampLabel(value) {
  if (!value) return "";

  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value}Z`;

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}


export default function ReportComments({
  reportId,
  canComment,
}) {
  const mountedRef = useRef(false);
  const actionRef = useRef(false);

  const [comments, setComments] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);


  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);


  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError("");
    setComments([]);

    async function loadComments() {
      try {
        const data = await getReportComments(reportId);

        if (!cancelled) {
          setComments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(messageFrom(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadComments();

    return () => {
      cancelled = true;
    };
  }, [reportId, retry]);


  async function handleSubmit(event) {
    event.preventDefault();

    if (
      actionRef.current ||
      !canComment ||
      loading ||
      loadError
    ) {
      return;
    }

    const text = message.trim();

    if (!text) {
      setSubmitError("Enter a comment.");
      return;
    }

    if (text.length > 2000) {
      setSubmitError("Comments can contain up to 2,000 characters.");
      return;
    }

    actionRef.current = true;
    setSaving(true);
    setSubmitError("");
    setSuccess("");

    try {
      const saved = await createReportComment(reportId, text);

      if (!mountedRef.current) return;

      setComments((previous) => [
        ...previous.filter((item) => item.id !== saved.id),
        saved,
      ]);

      setMessage("");
      setSuccess("Comment added successfully.");
    } catch (err) {
      if (mountedRef.current) {
        setSubmitError(messageFrom(err));
      }
    } finally {
      actionRef.current = false;

      if (mountedRef.current) setSaving(false);
    }
  }


  return (
    <section className="rc-section" aria-label="Report discussion">
      <div className="rc-heading">
        <div>
          <h3>Report discussion</h3>
          <p>Questions and updates between the QS and Building Owner.</p>
        </div>

        {!loading && !loadError && (
          <span className="rc-count">{comments.length}</span>
        )}
      </div>

      {loading ? (
        <p className="rc-status" role="status">
          Loading comments…
        </p>
      ) : loadError ? (
        <div className="ct-message ct-error" role="alert">
          <div>
            <p>{loadError}</p>
            <button
              type="button"
              className="ct-button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="rc-status">
              No comments yet.
            </p>
          ) : (
            <div className="rc-list">
              {comments.map((comment) => (
                <article className="rc-comment" key={comment.id}>
                  <div className="rc-avatar" aria-hidden="true">
                    {(comment.author_name || "M")
                      .trim()
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>

<div className="rc-comment-body">
  <div className="rc-message-bubble">
    <div className="rc-author-line">
      <strong>{comment.author_name || "Project member"}</strong>

      <time dateTime={comment.created_at}>
        {timestampLabel(comment.created_at)}
      </time>
    </div>

    <p>{comment.message}</p>
  </div>
</div>
                </article>
              ))}
            </div>
          )}

          {canComment ? (
            <form className="rc-form" onSubmit={handleSubmit}>
              <label className="ct-field" htmlFor="report-comment">
                Add a comment
                <textarea
                  id="report-comment"
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setSubmitError("");
                    setSuccess("");
                  }}
                  placeholder="Ask a question or share an update…"
                  maxLength={2000}
                  disabled={saving}
                  required
                />
              </label>

              {submitError && (
                <p className="rc-error" role="alert">
                  {submitError}
                </p>
              )}

              {success && (
                <p className="rc-success" role="status">
                  {success}
                </p>
              )}

              <div className="rc-form-footer">
                <span>{message.length} / 2000</span>

                <button
                  type="submit"
                  className="ct-button ct-primary"
                  disabled={saving || !message.trim()}
                >
                  {saving ? "Posting…" : "Post comment"}
                </button>
              </div>
            </form>
          ) : (
            <p className="rc-status">
              You can read this discussion. Only the assigned QS
              and Building Owner can post comments.
            </p>
          )}
        </>
      )}
    </section>
  );
}