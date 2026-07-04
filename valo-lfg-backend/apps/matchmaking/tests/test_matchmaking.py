import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import SocialAccount, User
from apps.matchmaking.models import JoinRequest, PartyListing


def make_client(username, *, discord=None):
    user = User.objects.create_user(email=f"{username}@example.com", username=username)
    if discord:
        SocialAccount.objects.create(
            user=user,
            provider=SocialAccount.Provider.DISCORD,
            provider_uid=f"uid-{username}",
            discord_username=discord,
        )
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}"
    )
    client.user = user
    return client


@pytest.fixture
def host(db):
    return make_client("host", discord="host#0001")


@pytest.fixture
def joiner(db):
    return make_client("joiner", discord="joiner#0002")


LISTING = {
    "listing_type": "lf_fifth",
    "region": "na",
    "party_size_target": 2,
    "rank_min": "gold",
    "rank_max": "diamond",
    "roles_needed": ["controller_main"],
    "comm_preference": "voice",
    "note": "chill ranked",
}


def create_listing(client, **overrides):
    resp = client.post("/api/listings/", {**LISTING, **overrides}, format="json")
    assert resp.status_code == 201, resp.data
    return resp.data


class TestCreateListing:
    def test_host_seeded_as_member(self, host):
        data = create_listing(host)
        assert data["status"] == "open"
        assert data["party_size_current"] == 1
        assert data["seats_open"] == 1
        assert len(data["members"]) == 1
        assert data["members"][0]["is_host"] is True
        assert data["viewer_is_host"] is True

    def test_rejects_bad_party_size(self, host):
        resp = host.post("/api/listings/", {**LISTING, "party_size_target": 6}, format="json")
        assert resp.status_code == 400

    def test_rejects_inverted_rank_range(self, host):
        resp = host.post(
            "/api/listings/",
            {**LISTING, "rank_min": "diamond", "rank_max": "gold"},
            format="json",
        )
        assert resp.status_code == 400

    def test_requires_auth(self):
        assert APIClient().post("/api/listings/", LISTING, format="json").status_code == 401


class TestFeed:
    def test_lists_open_only(self, host, joiner):
        create_listing(host)
        cancelled = create_listing(host)
        host.post(f"/api/listings/{cancelled['id']}/cancel/")
        resp = joiner.get("/api/listings/")
        assert resp.status_code == 200
        assert len(resp.data["results"]) == 1

    def test_filter_by_region(self, host, joiner):
        create_listing(host, region="na")
        create_listing(host, region="eu")
        resp = joiner.get("/api/listings/?region=eu")
        assert [r["region"] for r in resp.data["results"]] == ["eu"]

    def test_rank_filter_matches_accepted_range(self, host, joiner):
        # Listing accepts gold–diamond; a plat player qualifies, an iron player doesn't.
        create_listing(host, rank_min="gold", rank_max="diamond")
        assert len(joiner.get("/api/listings/?rank=platinum").data["results"]) == 1
        assert len(joiner.get("/api/listings/?rank=iron").data["results"]) == 0

    def test_role_filter_overlap(self, host, joiner):
        create_listing(host, roles_needed=["controller_main"])
        assert len(joiner.get("/api/listings/?roles=controller_main").data["results"]) == 1
        assert len(joiner.get("/api/listings/?roles=sentinel_main").data["results"]) == 0


class TestJoinRequest:
    def test_join_and_accept_flow(self, host, joiner):
        listing = create_listing(host)
        lid = listing["id"]

        req = joiner.post(f"/api/listings/{lid}/join-requests/", {"message": "gg?"}, format="json")
        assert req.status_code == 201

        # Host sees the pending request on the detail payload; joiner does not.
        detail = host.get(f"/api/listings/{lid}/")
        assert len(detail.data["join_requests"]) == 1
        assert joiner.get(f"/api/listings/{lid}/").data["join_requests"] == []

        rid = req.data["id"]
        accepted = host.post(f"/api/join-requests/{rid}/accept/")
        assert accepted.status_code == 200
        # Second seat filled -> auto-flip to FILLED.
        assert accepted.data["status"] == "filled"
        assert accepted.data["party_size_current"] == 2
        assert {m["username"] for m in accepted.data["members"]} == {"host", "joiner"}

    def test_cannot_join_own_listing(self, host):
        listing = create_listing(host)
        resp = host.post(f"/api/listings/{listing['id']}/join-requests/", {}, format="json")
        assert resp.status_code == 400

    def test_duplicate_pending_conflicts(self, host, joiner):
        listing = create_listing(host)
        lid = listing["id"]
        joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json")
        again = joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json")
        assert again.status_code == 409

    def test_decline(self, host, joiner):
        listing = create_listing(host)
        lid = listing["id"]
        rid = joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json").data["id"]
        resp = host.post(f"/api/join-requests/{rid}/decline/")
        assert resp.status_code == 200
        assert resp.data["status"] == "declined"

    def test_requester_can_cancel(self, host, joiner):
        listing = create_listing(host)
        lid = listing["id"]
        rid = joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json").data["id"]
        resp = joiner.post(f"/api/join-requests/{rid}/cancel/")
        assert resp.status_code == 200
        assert resp.data["status"] == "cancelled"

    def test_non_host_cannot_accept(self, host, joiner):
        listing = create_listing(host)
        lid = listing["id"]
        rid = joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json").data["id"]
        # joiner trying to accept their own request
        assert joiner.post(f"/api/join-requests/{rid}/accept/").status_code == 403


class TestDiscordReveal:
    def test_hidden_until_member(self, host, joiner):
        listing = create_listing(host, party_size_target=3)
        lid = listing["id"]

        # Outsider sees no Discord handle for the host.
        outsider_view = joiner.get(f"/api/listings/{lid}/")
        assert outsider_view.data["members"][0]["discord_username"] == ""

        # After being accepted, the joiner (now a member) sees the host's handle.
        rid = joiner.post(f"/api/listings/{lid}/join-requests/", {}, format="json").data["id"]
        host.post(f"/api/join-requests/{rid}/accept/")
        member_view = joiner.get(f"/api/listings/{lid}/")
        handles = {m["username"]: m["discord_username"] for m in member_view.data["members"]}
        assert handles["host"] == "host#0001"


class TestMyViews:
    def test_my_listings(self, host, joiner):
        create_listing(host)
        assert len(host.get("/api/listings/mine/").data["results"]) == 1
        assert len(joiner.get("/api/listings/mine/").data["results"]) == 0

    def test_my_join_requests(self, host, joiner):
        listing = create_listing(host)
        joiner.post(f"/api/listings/{listing['id']}/join-requests/", {}, format="json")
        mine = joiner.get("/api/join-requests/mine/")
        assert len(mine.data["results"]) == 1
        assert mine.data["results"][0]["listing"]["host_username"] == "host"
