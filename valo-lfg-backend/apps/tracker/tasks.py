"""Background job that walks a player's *entire* competitive history (every
act/episode HenrikDev has on file) and persists full rosters for the
Encounters feature — teammates/opponents/duos/trios/stacks across all time,
not just the recent detailed-match window Squad already covers.

Paced deliberately: one `get_match` call per historical match id, with a
short sleep between them, on top of the retry/backoff + stale-cache fallback
`henrikdev_client` already has for 429s. This is the "full backfill now"
path — a personal dev key, run against your own history, not a background
job that runs continuously.
"""
import logging
import time

from celery import shared_task

from apps.integrations.services import henrikdev_client as riot
from apps.tracker.models import EncounterBackfillJob, EncounterMatch
from apps.tracker.services.ingest import ingest_match

logger = logging.getLogger(__name__)

BACKFILL_SLEEP_SECONDS = 0.6  # gentle pacing between per-match detail calls
BACKFILL_MAX_PAGES = 50  # 50 * 100 = 5000 matches — far beyond any real history


@shared_task(bind=True)
def backfill_encounter_history(self, job_id: int):
    try:
        job = EncounterBackfillJob.objects.get(pk=job_id)
    except EncounterBackfillJob.DoesNotExist:
        return "gone"

    job.status = EncounterBackfillJob.Status.RUNNING
    job.save(update_fields=["status", "updated_at"])

    try:
        stored = riot.get_stored_matches(
            job.region, job.name, job.tag, mode=None, max_pages=BACKFILL_MAX_PAGES,
        )
    except riot.ProviderError as exc:
        job.status = EncounterBackfillJob.Status.FAILED
        job.error = str(exc)
        job.save(update_fields=["status", "error", "updated_at"])
        return "failed"

    match_ids = [m.match_id for m in stored if m.match_id]
    job.total = len(match_ids)
    job.save(update_fields=["total", "updated_at"])

    already = set(
        EncounterMatch.objects.filter(match_id__in=match_ids).values_list("match_id", flat=True)
    )

    ingested = 0
    for i, match_id in enumerate(match_ids, start=1):
        if match_id not in already:
            try:
                match = riot.get_match(job.region, match_id)
                if ingest_match(match):
                    ingested += 1
            except Exception as exc:  # noqa: BLE001 — one bad match must never abort the whole job
                # Includes ProviderError (rate limit / not found) *and* DB errors
                # like a mode whose team_id/field doesn't fit our columns. Skip
                # this match, keep walking the rest of the history.
                logger.warning("encounter backfill: match %s skipped: %r", match_id, exc)
            time.sleep(BACKFILL_SLEEP_SECONDS)

        job.done = i
        job.ingested = ingested
        job.save(update_fields=["done", "ingested", "updated_at"])

    job.status = EncounterBackfillJob.Status.DONE
    job.save(update_fields=["status", "updated_at"])
    return f"ingested {ingested} new / {job.total} total"
