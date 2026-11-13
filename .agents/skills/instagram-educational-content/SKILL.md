---
name: instagram-educational-content
description: Plan, write, design or review educational and scientific Instagram reels, posts, carousels and stories, with source-linked claims and mobile-first Persian copy.
---
# Educational and scientific Instagram content

Read the brief and identify the audience, one teaching objective, language and requested format. The director owns the brief and approved storyboard. Use `content_research` for evidence, `educational_writer` for the teaching sequence, and the existing visual, audio and QA roles for requested production. The workflow can stop at a brief, script or storyboard when that is the requested deliverable.

## Handoffs

- Use the shared brief and storyboard from `instagram-content-production`. Add the teaching objective to the brief, and connect storyboard items to the claim IDs they rely on.
- `claims.json` records each material factual claim with a stable ID, statement, status (`verified`, `qualified`, or `unresolved`), source links or DOI, exact supporting section/table/figure, and any qualification. Open and check the source. Use primary evidence or an authoritative technical reference appropriate to the claim. For tutorials verify the specific version when it matters.

## Editorial review

Tie each material claim in narration, screen text, charts and caption to evidence. Use a qualified claim with the qualification intact. Rewrite or omit unresolved claims before approving production copy. A model score or a provider fallback does not establish factual accuracy. Distinguish measured data from an illustration, and label units, axes, scales and material simplifications. Put readable source credits where appropriate and direct links in a source list accompanying the caption.

## Production by format

For programming explainers, choose a small executable example and state the runtime and conditions that matter. Run it before locking copy. Capture a per-step trace when the picture represents execution and derive visible state, values and results from that trace. Keep the important code LTR and labels RTL where relevant. For 3D, use the change in angle to reveal the spatial relationship and identify what the scene simplifies. Finish on the answer to the opening question and, when suitable, one new input the viewer can reason about. See the shared [direction and editing](../instagram-content-production/references/direction-and-editing.md) reference.

- **Reel** starts with a question or concrete result and moves through one concept or example. Use a vertical 9:16 composition unless the brief specifies otherwise. Time the edit and captions to measured narration when present. Check pronunciation, RTL shaping, phone-size readability and sound-on/muted playback. Use Remotion and FFmpeg for timing and delivery, with Blender when a 3D view explains the subject.
- **Image or carousel** defaults to a 4:5 feed layout. Give the first image a clear question or takeaway. Assign one teaching job to each image and make labels readable at phone size. Check order, RTL shaping, chart legibility and crop margins. Deliver the ordered images and a caption with sources when applicable.
- **Story** introduces the question on the first card and uses short visual beats. Keep evidence visible or include a source-link placement note for manual publication. Check diagram and text visibility around the story interface.

Keep publication manual.
