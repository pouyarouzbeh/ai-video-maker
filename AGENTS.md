# Instagram content production

The primary Codex agent owns the brief, storyboard, edit, integration and delivery and is the sole writer of the shared storyboard. Start requests for Instagram reels, posts and stories with `instagram-content-production`. The skill maps photos, clips, scripts, copy and ideas to the requested output and defines the shared production files.

- For a website portfolio reel, use `instagram-portfolio-reel` and the active project's brief, asset manifest and timeline.
- For educational or scientific content in any Instagram format, also use `instagram-educational-content`. Invoke `content_research` for the evidence handoff and `educational_writer` for teaching copy when the task calls for delegation. Review evidence-sensitive copy before locking it or producing media.
- For a multi-item production that needs a storyboard or visual continuity pass, delegate that pass to `content_storyboard` when the task calls for delegation. The primary agent integrates the storyboard and records approval state.
- Use `reel_assets` for acquisition, `reel_motion` for visuals, `reel_audio` when a reel needs sound, and `reel_qa` for final review. Motion and sound may proceed concurrently after the storyboard is locked. Run Blender and Remotion renders serially. Reviewers report defects by scene, slide, or timecode and the director fixes or explicitly resolves them.

For a requested production run, review the reel or story preview or the feed layout before final export. Follow README.md for local setup. Keep publishing manual.
