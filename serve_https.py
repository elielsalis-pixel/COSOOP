"""
HTTPS server para Cosoop.
Genera un certificado autofirmado la primera vez y lo reutiliza.
"""
import ssl, os, datetime, ipaddress, socket
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT   = 5500
CERT   = 'cosoop_cert.pem'
KEY    = 'cosoop_key.pem'
FOLDER = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    finally:
        s.close()

def generar_cert():
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    ip = get_local_ip()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Cosoop')])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName([
            x509.IPAddress(ipaddress.IPv4Address(ip)),
            x509.DNSName('localhost'),
        ]), critical=False)
        .sign(key, hashes.SHA256())
    )

    with open(os.path.join(FOLDER, KEY),  'wb') as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
    with open(os.path.join(FOLDER, CERT), 'wb') as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print(f'  Certificado generado para IP {ip}')

os.chdir(FOLDER)

cert_path = os.path.join(FOLDER, CERT)
key_path  = os.path.join(FOLDER, KEY)

if not os.path.exists(cert_path) or not os.path.exists(key_path):
    print('Generando certificado SSL...')
    generar_cert()

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert_path, key_path)

ip = get_local_ip()
httpd = HTTPServer(('0.0.0.0', PORT), SimpleHTTPRequestHandler)
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

print(f'\n  Cosoop HTTPS server corriendo')
print(f'  https://{ip}:{PORT}')
print(f'\n  En el celular: abri esa URL, toca "Avanzado" > "Continuar" (solo la primera vez).\n')
httpd.serve_forever()
