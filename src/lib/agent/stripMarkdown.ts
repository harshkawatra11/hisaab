// Every model reply is spoken aloud through TTS or shown as a plain
// transcript line, never rendered as markdown. The system prompt
// already tells the model not to use markdown, but that is a request,
// not a guarantee, and the Groq/OpenRouter fallback tiers in
// particular tend to format replies with bold and bullet markers the
// way Gemini does not. Stripping defensively here means a literal
// "**" is never read aloud or shown in the transcript, regardless of
// which tier answered.

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^[-*+]\s+/gm, "") // bullet points
    .replace(/^\d+\.\s+/gm, "") // numbered list markers
    .replace(/`([^`]+)`/g, "$1") // inline code
    .trim();
}
