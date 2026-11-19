# Extra CA certificates for the Docker build (optional)

Most people can ignore this folder.

If `docker compose up -d` fails while building, and the log shows `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (often followed by
npm's `Exit handler never called!`), something on your network re-signs HTTPS traffic: usually antivirus "HTTPS/SSL
scanning" (AVG, Avast, Kaspersky, ...) or a company proxy. Windows trusts that tool's root certificate, but the build
container does not.

Fix, one of:

1. Turn off HTTPS scanning for Docker in your antivirus, or
2. Put the tool's **root certificate** here as a PEM file ending in `.crt`, then run `docker compose up -d --build`.
   The build trusts it for `npm install` only; it is not copied into the final image.

   Export it on Windows (PowerShell; change the name to match your tool):

       Get-ChildItem Cert:\LocalMachine\Root | Where-Object Subject -like '*AVG Web/Mail Shield Root*' |
         ForEach-Object { "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($_.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----" } |
         Set-Content certs\antivirus-root.crt

Files here other than this README are ignored by git, so your certificate is never committed.
