$baseUrl = "http://localhost:5000/api"
$passed = 0
$failed = 0

function Test-Endpoint {
    param($name, $method, $url, $body, $headers)
    try {
        $params = @{ Uri = $url; Method = $method; ContentType = "application/json" }
        if ($body) { $params.Body = ($body | ConvertTo-Json) }
        if ($headers) { $params.Headers = $headers }
        $response = Invoke-RestMethod @params -ErrorAction Stop
        Write-Host "PASS -- $name" -ForegroundColor Green
        $script:passed++
        return $response
    } catch {
        Write-Host "FAIL -- $name -- $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

Write-Host "========== FraudShield Backend Tests ==========" -ForegroundColor Cyan

Test-Endpoint "Health Check" "GET" "http://localhost:5000/health" $null $null

Write-Host "--- Auth ---" -ForegroundColor Yellow
$loginBody = @{ email = "admin@fraudshield.com"; password = "Admin@123" }
$loginRes = Test-Endpoint "Admin Login" "POST" "$baseUrl/auth/login" $loginBody $null
$token = $loginRes.data.token
$authHeader = @{ Authorization = "Bearer $token" }

$analystBody = @{ email = "analyst@fraudshield.com"; password = "Analyst@123" }
Test-Endpoint "Analyst Login" "POST" "$baseUrl/auth/login" $analystBody $null

try {
    $badBody = @{ email = "wrong@test.com"; password = "wrongpass" }
    Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -ContentType "application/json" -Body ($badBody | ConvertTo-Json) -ErrorAction Stop
    Write-Host "FAIL -- Bad Login should have been rejected" -ForegroundColor Red
    $failed++
} catch {
    Write-Host "PASS -- Bad Login correctly rejected" -ForegroundColor Green
    $passed++
}

Write-Host "--- Transactions ---" -ForegroundColor Yellow
Test-Endpoint "Get Transactions" "GET" "$baseUrl/transactions" $null $authHeader
Test-Endpoint "Get Transaction by ID" "GET" "$baseUrl/transactions/0971e8b2-217b-4231-93e3-8056904a4f9d" $null $authHeader

Test-Endpoint "Mark Transaction Safe" "PATCH" "$baseUrl/transactions/0971e8b2-217b-4231-93e3-8056904a4f9d/mark-safe" $null $authHeader

Write-Host "--- Alerts ---" -ForegroundColor Yellow
Test-Endpoint "Get Alerts" "GET" "$baseUrl/alerts" $null $authHeader

Write-Host "--- Rules ---" -ForegroundColor Yellow
Test-Endpoint "Get Rules" "GET" "$baseUrl/rules" $null $authHeader

Write-Host "--- Analytics ---" -ForegroundColor Yellow
Test-Endpoint "Analytics Dashboard" "GET" "$baseUrl/analytics/dashboard" $null $authHeader
Test-Endpoint "Analytics Trends" "GET" "$baseUrl/analytics/transaction-trend" $null $authHeader
Test-Endpoint "Risk Distribution" "GET" "$baseUrl/analytics/risk-distribution" $null $authHeader

Write-Host "--- ML Service ---" -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:5001/health" -Method GET -ErrorAction Stop
    Write-Host "PASS -- ML Service Health" -ForegroundColor Green
    $passed++
} catch {
    Write-Host "FAIL -- ML Service not responding on port 5001" -ForegroundColor Red
    $failed++
}

Write-Host "========== RESULTS ==========" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
if ($failed -eq 0) {
    Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
} else {
    Write-Host "Some tests failed - paste output for fixes" -ForegroundColor Yellow
}
