from jwcrypto import jwk
from json import dumps, loads

with open("keypair.pem", "rb") as pem_file:
    key = jwk.JWK.from_pem(pem_file.read())

public_key_b64 = key.export(private_key=False)
private_key_b64 = key.export(private_key=True)
jwks = {}
jwks["keys"] = [loads(public_key_b64)]

with open("jwks.json", "w") as jwks_file:
    jwks_file.write(dumps(jwks)) 

with open("private_key.json", "w") as private_key_file:
    private_key_file.write(dumps(private_key_b64)) 
