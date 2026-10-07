$env:OPENAPI_SPEC_FILE = "demo/openapi.json"
$env:TRUSTED_API_ORIGIN = "https://jsonplaceholder.typicode.com"
$env:APPROVED_GET_OPERATIONS = "listPosts,getPost"
node src/server.mjs

