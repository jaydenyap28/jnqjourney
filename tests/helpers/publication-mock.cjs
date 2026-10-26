// Isolate the NEW publication side effect in legacy writer/SDK tests. The real
// planner, coordinator, verifier and HTTP lifecycle have their own integration
// tests; these fixtures keep the original persistence/error assertions intact.
exports.publicationMock = (events = []) => ({
  invalidatePublication: async (_request, change) => {
    events.push(`publication:${change.kind}`)
    return { state: 'verification-required', change, plan: { tags: [], paths: [], englishPaths: [] }, checks: [], retry: { url: '/api/admin/publication-retry', body: change } }
  },
  publicationResponse: (payload, publication, status = 200) => Response.json({ ...payload, publication },{status}),
  publicationFailure: () => Response.json({ partial: true, error: 'Authoritative data already be saved; public publication failed.' }, { status: 503 }),
})
