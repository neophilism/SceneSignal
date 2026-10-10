# SS-08 public session discovery projection

SceneDiscovery is a portable, memory-only, deliberately minimized public listing kernel. It only publishes sessions that are currently signed-authorized in the SceneSession lifecycle, checks organizer credentials through the supplied trusted actor context, and automatically suppresses changed, expired, cancelled or stopped sessions. It supports free admission, queryable public copy, deliberately disclosed area/accessibility text and consented artist lineup.

It does not host a web service or supply registration, authorization, permits, location validation or a persistent index. The publicly supplied event area must be screened by the organizer; never input a private site reference by default. Real persistence and web publishing must only store/send the explicitly typed PublicSessionPage projection. Keep exact site details, permits, private conditions, coordinates, identities and keys in their separate E2EE path.

Tests use explicit test adapters for signed authorizations and demonstrate filtering, no private-field exposure, role denial, automatic revision invalidation and unpublishing.
