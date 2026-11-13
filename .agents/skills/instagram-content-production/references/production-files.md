# Production files

For a new multi-item project, use `projects/<slug>/` for editable plans and `out/<slug>/` for delivery. Existing projects such as Peony keep their renderer-specific inputs. For the workflow below, use the following file shapes. Keep optional files out of small jobs that do not need them.

| File | Contents |
|---|---|
| `brief.json` | `title`, `goal`, `audience`, `language`, `format` (`reel`, `image`, `carousel`, `story`), `inputs` (each with `id`, `kind`, `role`, and local path, URL or text). Role identifies source material, required copy, or a reference. Include target duration or number of items when specified. Use one brief per placement for a campaign. |
| `assets.json` | Asset records keyed by stable ID, with local path and provenance. Note reuse terms or attribution when relevant, plus visual properties the asset should guide or preserve. Generated assets carry their origin and reference IDs. |
| `storyboard.json` | Ordered `items`. Each item has a stable `id`, `purpose`, `visual`, `onScreenText`, `assetIds`, and `status` (`draft`, `approved`, `locked`). Add `claimIds` for evidence-sensitive material, `narration` for spoken copy, and `durationSeconds` for moving items. For static or mixed stories, record image/video per item. |
| `claims.json` | Scientific or evidence-sensitive claim records, as defined in the educational skill. |
| `timeline.json` | Renderer input for motion work. Record frame ranges, audio/subtitle cues and the storyboard item ID so edits can be traced back. |

For detailed projects add `style.referenceFrames`, palette, fonts and grade intentions to the brief. Record the reason for important cuts, camera and focus choices, reading holds and continuity in the storyboard. Keep frame-level caption, title and audio timing editable. A single simple image may put its only item in `brief.items`. The local renderer and field examples are in the [workspace README](../../../../README.md).

For shots with continuity requirements, record a short `continuity` note on the storyboard item. Specify reference asset IDs, what stays constant, and the shot's opening/closing composition where useful. For a carousel or story series, record the type and layout rules once and document exceptions per item.

Keep previews and derived media identified by item and revision. Before resuming, check that the artifact exists and reflects the latest relevant script, reference, timing and render settings. On a scoped revision update the affected item only, then refresh dependent cues and previews. Use the storyboard as the decision record for approvals.

## ViMax references

The local workflow adapts ViMax's idea/script entry points, separation of text planning from rendering, reference selection per shot and opening/closing frame descriptions. References are pinned to the version inspected.

- [ViMax overview and entry points](https://github.com/HKUDS/ViMax/blob/fd4b72e7731be6e5f88486206d25ea59849b0285/readme.md)
- [Text planning and rendering](https://github.com/HKUDS/ViMax/blob/fd4b72e7731be6e5f88486206d25ea59849b0285/pipelines/script2video_pipeline.py)
- [Reference selection](https://github.com/HKUDS/ViMax/blob/fd4b72e7731be6e5f88486206d25ea59849b0285/agents/reference_image_selector.py)
- [Shot descriptions](https://github.com/HKUDS/ViMax/blob/fd4b72e7731be6e5f88486206d25ea59849b0285/interfaces/shot_description.py)
