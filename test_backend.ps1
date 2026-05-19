# FraudShield Backend Test Suite
$BASE = "http://localhost:5000/api"
$pass = 0
$fail = 0

function Test($name, $result) {
    if ($result) {
        Write-Host "  [PASS] $name" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  [FAIL] $name" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "`n=== FraudShield Backend Test Suite ===" -ForegroundColor Cyan

# ── 1. Health Check ──────────────────────────────────────────
Write-Host "`n[1] Health Check" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod "$BASE/../health" -Method GET
    Test "Health endpoint returns ok" ($r.status -eq "ok")
} catch {
    Test "Health endpoint reachable" $false
}

# ── 2. Auth ──────────────────────────────────────────────────
Write-Host "`n[2] Authentication" -ForegroundColor Yellow
$token = $null
try {
    $body = '{"email":"admin@fraudshield.com","password":"Admin@123"}' 
    $r = Invoke-RestMethod "$BASE/auth/login" -Method POST -Body $body -ContentType "application/json"
    $token = $r.token
    Test "Admin login succeeds"        ($null -ne $token)
    Test "Response contains user"      ($null -ne $r.user)
    Test "User role is admin"          ($r.user.role -eq "admin")
} catch {
    Test "Admin login succeeds" $false
    Test "Response contains user" $false
    Test "User role is admin" $false
}

$headers = @{ Authorization = "Bearer $token" }

# ── 3. Transactions ──────────────────────────────────────────
Write-Host "`n[3] Transactions" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod "$BASE/transactions" -Method GET -Headers $headers
    $data = if ($r.data) { $r.data } else { $r }
    Test "GET /transactions returns array"     ($data -is [array])
    Test "Transactions have data"              ($data.Count -gt 0)
} catch {
    Test "GET /transactions returns array" $false
    Test "Transactions have data" $false
}

# ── 4. Alerts ────────────────────────────────────────────────
Write-Host "`n[4] Alerts" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod "$BASE/alerts" -Method GET -Headers $headers
    $data = if ($r.data) { $r.data } else { $r }
    Test "GET /alerts returns array"   ($data -is [array])
    Test "Alerts have data"            ($data.Count -gt 0)
} catch {
    Test "GET /alerts returns array" $false
    Test "Alerts have data" $false
}

# ── 5. Rules ─────────────────────────────────────────────────
Write-Host "`n[5] Rules" -ForegroundColor Yellow
$ruleId = $null
try {
    $r = Invoke-RestMethod "$BASE/rules" -Method GET -Headers $headers
    $data = if ($r.data) { $r.data } else { $r }
    Test "GET /rules returns array"    ($data -is [array])
    Test "Rules have data"             ($data.Count -gt 0)
    $ruleId = $data[0].id
} catch {
    Test "GET /rules returns array" $false
    Test "Rules have data" $false
}

# Toggle rule
if ($ruleId) {
    try {
        $r = Invoke-RestMethod "$BASE/rules/$ruleId/toggle" -Method PATCH -Headers $headers
        Test "PATCH /rules/:id/toggle works" ($null -ne $r)
        # Toggle back
        Invoke-RestMethod "$BASE/rules/$ruleId/toggle" -Method PATCH -Headers $headers | Out-Null
    } catch {
        Test "PATCH /rules/:id/toggle works" $false
    }
}

# ── 6. Analytics ─────────────────────────────────────────────
Write-Host "`n[6] Analytics" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod "$BASE/analytics/summary" -Method GET -Headers $headers
    Test "GET /analytics/summary works" ($null -ne $r)
} catch {
    Test "GET /analytics/summary works" $false
}

# ── 7. Protected route without token ─────────────────────────
Write-Host "`n[7] Auth Protection" -ForegroundColor Yellow
try {
    Invoke-RestMethod "$BASE/transactions" -Method GET | Out-Null
    Test "Protected route blocks unauthenticated" $false
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Test "Protected route returns 401" ($code -eq 401)
}

# ── Summary ──────────────────────────────────────────────────
Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "  PASSED: $pass" -ForegroundColor Green
Write-Host "  FAILED: $fail" -ForegroundColor Red
Write-Host "======================================`n" -ForegroundColor Cyan