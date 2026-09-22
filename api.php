<?php
/* Samme JSON-API som server/server.mjs, men i PHP — til webhoteller uden Node
 * (Simply.com, One.com, DanDomain og resten af flokken).
 *
 * Ligger i roden sammen med index.html og .htaccess, som sender /api/... herind.
 * Data havner i data.json ved siden af — den blokeres af .htaccess.
 *
 * Der skal ikke rettes i js/config.js: "auto" opdager selv API'et.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const COLLECTIONS = ['invoices', 'tickets', 'tips', 'settings', 'presets'];

/* Samlinger, hvor skrivning kræver adgangskode. Kolleger må gerne oprette sager
   og betale — men ikke lave deres egne regninger eller pille ved priserne. */
const PROTECTED = ['invoices', 'presets', 'settings'];

$DATA = __DIR__ . '/data.json';

/* Adgangskoden søges først uden for web-roden, hvor ingen webserver kan levere
   den overhovedet. Findes den ikke der, bruges roden, hvor .htaccess spærrer. */
$SECRET_PATHS = [
    dirname(__DIR__) . '/zachgpt-admin-password.txt',
    __DIR__ . '/admin-password.txt',
];

function fail(int $code, string $message): void
{
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/* Læs, ændr og skriv under én lås, så to samtidige kald ikke taber hinandens data.
 * $fn får hele datasættet som reference og returnerer svaret til klienten. */
function mutate(callable $fn)
{
    global $DATA;

    $fh = @fopen($DATA, 'c+');
    if ($fh === false) {
        fail(500, 'kan ikke åbne data.json — tjek skriverettigheder');
    }
    flock($fh, LOCK_EX);

    $raw = stream_get_contents($fh);
    $all = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($all)) {
        $all = [];
    }

    $dirty = false;
    $response = $fn($all, $dirty);

    if ($dirty) {
        rewind($fh);
        ftruncate($fh, 0);
        fwrite($fh, json_encode(
            $all,
            JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        ));
        fflush($fh);
    }

    flock($fh, LOCK_UN);
    fclose($fh);

    return $response;
}

function body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 1000000) {
        fail(413, 'for stor');
    }
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

/* ---------- Adgangskode ---------- *
 * Findes admin-password.txt ikke, er alt åbent som før. Filen ligger uden for
 * Git og blokeres af .htaccess, så indholdet kan ikke hentes i browseren.
 */

function adminSecret(): ?string
{
    global $SECRET_PATHS;
    foreach ($SECRET_PATHS as $path) {
        if (is_readable($path)) {
            $value = trim((string) file_get_contents($path));
            if ($value !== '') {
                return $value;
            }
        }
    }
    return null;
}

function adminPassword(): ?string
{
    return adminSecret();
}

/* Filen må indeholde enten adgangskoden i klartekst eller dens sha256-hash
   (64 hex-tegn). Med et hash står kodeordet ingen steder på serveren. */
function secretMatches(string $stored, string $sent): bool
{
    if (preg_match('/^[a-f0-9]{64}$/i', $stored) === 1) {
        return hash_equals(strtolower($stored), hash('sha256', $sent));
    }
    return hash_equals($stored, $sent);
}

function tokenFor(string $secret): string
{
    return hash('sha256', 'zachgpt:' . $secret);
}

function isAuthorised(): bool
{
    $pw = adminPassword();
    if ($pw === null) {
        return true; // ingen adgangskode sat
    }
    $sent = (string) ($_SERVER['HTTP_X_ZG_TOKEN'] ?? '');
    return $sent !== '' && hash_equals(tokenFor($pw), $sent);
}

/* ---------- Ruting ---------- */

/* Ikke alle webhoteller udfylder PATH_INFO — så falder vi tilbage på REQUEST_URI. */
$path = (string) ($_SERVER['PATH_INFO'] ?? '');
if ($path === '') {
    $uri = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '');
    if (preg_match('#/api/(.*)$#', $uri, $m) === 1) {
        $path = $m[1];
    }
}
$path  = trim($path, '/');
$parts = $path === '' ? [] : array_map('rawurldecode', explode('/', $path));

$collection = $parts[0] ?? '';
$id         = $parts[1] ?? null;
$method     = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* /api/auth ligger uden for samlingerne. */
if ($collection === 'auth') {
    if ($method === 'GET') {
        echo json_encode(['required' => adminPassword() !== null]);
        exit;
    }
    if ($method === 'POST') {
        $pw = adminPassword();
        if ($pw === null) {
            echo json_encode(['token' => '', 'required' => false]);
            exit;
        }
        $sent = (string) (body()['password'] ?? '');
        /* Lille forsinkelse, så adgangskoden ikke kan gættes i et hurtigt loop. */
        usleep(400000);
        if ($sent === '' || !secretMatches($pw, $sent)) {
            fail(401, 'forkert adgangskode');
        }
        echo json_encode(['token' => tokenFor($pw), 'required' => true]);
        exit;
    }
    fail(405, 'metode ikke tilladt');
}

if (!in_array($collection, COLLECTIONS, true)) {
    fail(404, 'ukendt samling');
}

$needsAuth = $method !== 'GET'
    && (in_array($collection, PROTECTED, true) || $method === 'DELETE');

if ($needsAuth && !isAuthorised()) {
    fail(401, 'adgangskode kræves');
}
if ($id !== null && !preg_match('/^[A-Za-z0-9_\-.~:@+]{1,200}$/', $id)) {
    fail(400, 'ugyldigt id');
}

if ($method === 'GET' && $id === null) {
    $docs = mutate(function (array &$all, bool &$dirty) use ($collection) {
        $bucket = $all[$collection] ?? [];
        $out = [];
        foreach ($bucket as $key => $doc) {
            $doc['id'] = (string) $key;
            $out[] = $doc;
        }
        return $out;
    });
    echo json_encode($docs, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST' && $id === null) {
    $doc = body();
    $newId = mutate(function (array &$all, bool &$dirty) use ($collection, $doc) {
        $newId = 't' . base_convert((string) time(), 10, 36) . bin2hex(random_bytes(2));
        $all[$collection][$newId] = $doc;
        $dirty = true;
        return $newId;
    });
    http_response_code(201);
    echo json_encode(['id' => $newId], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'PUT' && $id !== null) {
    $doc = body();
    mutate(function (array &$all, bool &$dirty) use ($collection, $id, $doc) {
        $all[$collection][$id] = $doc;
        $dirty = true;
        return null;
    });
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'PATCH' && $id !== null) {
    $patch = body();
    $found = mutate(function (array &$all, bool &$dirty) use ($collection, $id, $patch) {
        if (!isset($all[$collection][$id])) {
            return false;
        }
        $all[$collection][$id] = array_merge($all[$collection][$id], $patch);
        $dirty = true;
        return true;
    });
    if (!$found) {
        fail(404, 'findes ikke');
    }
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'DELETE' && $id !== null) {
    mutate(function (array &$all, bool &$dirty) use ($collection, $id) {
        if (isset($all[$collection][$id])) {
            unset($all[$collection][$id]);
            $dirty = true;
        }
        return null;
    });
    echo json_encode(['ok' => true]);
    exit;
}

fail(405, 'metode ikke tilladt');
