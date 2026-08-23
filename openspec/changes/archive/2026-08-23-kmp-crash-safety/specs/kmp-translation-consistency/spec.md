# kmp-translation-consistency Spec

## ADDED Requirements

### Requirement: Concurrent translations are race-free
The translation client SHALL guard its shared conversation-context state so that concurrent `translate()` calls (one per finalized segment) never throw, never lose a segment's translation results, and never feed a torn context snapshot to the LLM prompt.

#### Scenario: Two segments finalize in quick succession
- **WHEN** two segments are translated concurrently
- **THEN** both segments receive their translation results and the context window contains both segments in arrival order

#### Scenario: Context snapshot under mutation
- **WHEN** a translation request builds its context while another call is appending a segment
- **THEN** the request uses a consistent snapshot (no `ConcurrentModificationException`, no partially updated context)
