// Unlike the RSC-only `server-only` marker, this shared module also supports
// Next 14 Pages getServerSideProps. Next removes its imports from the client
// entry; fail immediately if a future consumer crosses that boundary.
if (typeof window !== 'undefined') throw new Error('Server data module imported in a browser.')
export {}
