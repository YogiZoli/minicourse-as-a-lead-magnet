# Decisions

- 2026-10-10: One name everywhere: `minicourse-as-a-lead-magnet` (repo, Railway, GCP, OAuth app, package).
- 2026-10-10: Zero npm dependencies on the server. Node built-in http and fetch only.
- 2026-10-10: The browser builds one normalized course payload (`Outline.pushCourse`), and every push route accepts the same payload.
- 2026-10-10: GHL import uses header `Version: 2021-07-28`. Verified live. The docs page is labeled v3 but names no header value.
- 2026-10-10: GHL posts are sent with `contentType: "video"` and `visibility: "draft"`, lesson text as HTML in `description`.
- 2026-10-10: Whop lessons are `lesson_type: "text"` with markdown content, course `visibility: "hidden"`.
- 2026-10-10: MCG has no API key. Only an MCP server behind OAuth, with open client registration. The OAuth client is registered per visitor session and kept in the browser tab, nothing on the server.
- 2026-10-10: YouTube sign-in uses the Google token flow in the browser, scope `youtube.force-ssl` only. No Google secret or refresh token exists anywhere.
- 2026-10-10: The video brief is named Video Course Content Brief, documented in `schema/video-course-content-brief.md`.
- 2026-10-10: Answers and outline are kept in sessionStorage (this tab only). The AI key is kept in sessionStorage only.
