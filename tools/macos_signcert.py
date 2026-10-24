#!/usr/bin/env python3
"""
Gleichbleibendes Signier-Zertifikat für die Mac-App (selbst ausgestellt, ohne Apple-Konto).

Warum: Mit der bisherigen Ad-hoc-Signatur sieht macOS jedes Update als neue App und fragt das
Mikrofon jedes Mal neu ab. Mit immer demselben Zertifikat bleibt die Freigabe erhalten.

Wie: Schlüssel und Zertifikat werden bei jedem Bau aus einem vorhandenen GitHub-Secret abgeleitet
(Umgebungsvariable SEED) – immer identisch, ohne dass ein Schlüssel gespeichert oder weitergegeben wird.
RSA-Primzahlen aus einem SHA-512-Zähler, Zertifikat mit festen Daten und deterministischer Signatur
(PKCS#1 v1.5) – dadurch Byte für Byte gleich.

Aufruf: SEED=... python3 macos_signcert.py ausgabe.p12 passwort
"""
from __future__ import annotations

import datetime
import hashlib
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

NAME = "LeitWerk Codesign"
E = 65537


def strom(seed: bytes):
    n = 0
    while True:
        yield hashlib.sha512(seed + n.to_bytes(8, "big")).digest()
        n += 1


def ist_prim(n: int) -> bool:
    if n < 2:
        return False
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    # feste Basen: deterministisch, Fehlerwahrscheinlichkeit vernachlässigbar
    for a in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97):
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def primzahl(quelle, bits: int) -> int:
    while True:
        b = b"".join(next(quelle) for _ in range(bits // 512))
        k = int.from_bytes(b, "big") | (3 << (bits - 2)) | 1
        if ist_prim(k) and (k - 1) % E != 0:
            return k


def main() -> None:
    seed = os.environ.get("SEED", "").encode()
    if len(seed) < 32:
        sys.exit("SEED fehlt oder ist zu kurz")
    q = strom(hashlib.sha512(b"leitwerk-macos-codesign-v1" + seed).digest())
    p = primzahl(q, 1024)
    r = primzahl(q, 1024)
    if p == r:
        sys.exit("gleiche Primzahlen")
    n = p * r
    phi = (p - 1) * (r - 1)
    d = pow(E, -1, phi)
    key = rsa.RSAPrivateNumbers(
        p=p, q=r, d=d, dmp1=rsa.rsa_crt_dmp1(d, p), dmq1=rsa.rsa_crt_dmq1(d, r), iqmp=rsa.rsa_crt_iqmp(p, r),
        public_numbers=rsa.RSAPublicNumbers(E, n),
    ).private_key()
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, NAME), x509.NameAttribute(NameOID.ORGANIZATION_NAME, "LeitWerk")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc))
        .not_valid_after(datetime.datetime(2046, 1, 1, tzinfo=datetime.timezone.utc))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(True, False, False, False, False, False, False, False, False), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CODE_SIGNING]), critical=True)
        .sign(key, hashes.SHA256())
    )
    # Kontrolle: Signatur ist deterministisch (PKCS#1 v1.5)
    key.public_key().verify(cert.signature, cert.tbs_certificate_bytes, padding.PKCS1v15(), hashes.SHA256())
    pw = sys.argv[2].encode()
    enc = (
        serialization.PrivateFormat.PKCS12.encryption_builder()
        .kdf_rounds(50000)
        .key_cert_algorithm(pkcs12.PBES.PBESv1SHA1And3KeyTripleDESCBC)
        .hmac_hash(hashes.SHA1())
        .build(pw)
    )
    with open(sys.argv[1], "wb") as f:
        f.write(pkcs12.serialize_key_and_certificates(NAME.encode(), key, cert, None, enc))
    with open(sys.argv[1] + ".pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print("Zertifikat:", hashlib.sha1(cert.public_bytes(serialization.Encoding.DER)).hexdigest())


if __name__ == "__main__":
    main()
