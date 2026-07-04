import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import RiotAccountLink
from .services import henrikdev_client

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 20
# Keep polling past the user-facing window: a match started in-window can take
# several minutes to land in HenrikDev's data. The link stays PENDING (the UI
# keeps waiting) until this grace also elapses.
VERIFICATION_GRACE = timedelta(minutes=10)


def apply_mmr(link: RiotAccountLink) -> None:
    mmr = henrikdev_client.get_mmr(link.region, link.puuid)
    link.current_tier = mmr.current_tier
    link.current_division = mmr.current_division
    link.current_rr = mmr.current_rr
    link.peak_tier = mmr.peak_tier
    link.peak_division = mmr.peak_division
    link.last_rank_refresh_at = timezone.now()


@shared_task(bind=True, max_retries=90)
def poll_riot_verification(self, link_id: int):
    """Polls the matchlist during the verification window; a match that
    started inside the window proves live control of the account."""
    try:
        link = RiotAccountLink.objects.get(pk=link_id)
    except RiotAccountLink.DoesNotExist:
        return "gone"
    if link.status != RiotAccountLink.Status.PENDING:
        return f"already {link.status}"

    now = timezone.now()
    poll_deadline = (
        link.verification_window_end + VERIFICATION_GRACE
        if link.verification_window_end
        else None
    )
    if poll_deadline and now > poll_deadline:
        link.status = RiotAccountLink.Status.EXPIRED
        link.save(update_fields=["status", "updated_at"])
        return "expired"

    try:
        match_id = henrikdev_client.get_latest_match_after(
            link.region, link.puuid, link.verification_window_start
        )
    except henrikdev_client.ProviderError as exc:
        logger.warning("verification poll failed for link %s: %s", link_id, exc)
        match_id = None

    if match_id:
        link.status = RiotAccountLink.Status.VERIFIED
        link.verification_match_id = match_id
        try:
            apply_mmr(link)
        except henrikdev_client.ProviderError as exc:
            logger.warning("rank fetch after verification failed: %s", exc)
        link.save()
        return "verified"

    raise self.retry(countdown=POLL_INTERVAL_SECONDS)


@shared_task
def refresh_all_ranks():
    """Periodic rank refresh for all verified links (Celery Beat)."""
    refreshed = 0
    for link in RiotAccountLink.objects.filter(status=RiotAccountLink.Status.VERIFIED):
        try:
            apply_mmr(link)
            link.save()
            refreshed += 1
        except henrikdev_client.ProviderError as exc:
            logger.warning("rank refresh failed for %s: %s", link, exc)
    return f"refreshed {refreshed}"
