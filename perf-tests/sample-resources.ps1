# เก็บ CPU/RAM ของ API (โปรเซส node ที่ฟังพอร์ต 4000) และฐานข้อมูล (คอนเทนเนอร์ postgres) ทุก 5 วินาที
#   powershell -File sample-resources.ps1 -Out results\load-resources.csv -StopFile results\.stop
# หยุดเมื่อมีไฟล์ StopFile (run-all.sh สร้างให้หลัง k6 จบ)
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [Parameter(Mandatory = $true)][string]$StopFile,
  [int]$IntervalSec = 5,
  [string]$DbContainer = "systemboq-db-1"
)

$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$conn = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $conn) { throw "ไม่พบโปรเซสที่ฟังพอร์ต 4000 (API ยังไม่เปิด)" }
$apiPid = $conn.OwningProcess

"time,api_cpu_pct,api_mem_mb,db_cpu_pct,db_mem_mb" | Out-File -FilePath $Out -Encoding ascii
$prev = (Get-Process -Id $apiPid).TotalProcessorTime.TotalSeconds
$prevAt = Get-Date

while (-not (Test-Path $StopFile)) {
  Start-Sleep -Seconds $IntervalSec
  $p = Get-Process -Id $apiPid -ErrorAction SilentlyContinue
  if (-not $p) { break }
  $now = Get-Date
  $cpu = $p.TotalProcessorTime.TotalSeconds
  # % ของเครื่องทั้งเครื่อง (ทุกคอร์รวมกัน = 100%)
  $apiCpu = [math]::Round(($cpu - $prev) / ($now - $prevAt).TotalSeconds / $cores * 100, 1)
  $prev = $cpu; $prevAt = $now
  $apiMem = [math]::Round($p.WorkingSet64 / 1MB, 0)

  $stats = docker stats --no-stream --format "{{.CPUPerc}};{{.MemUsage}}" $DbContainer 2>$null
  $dbCpu = ""; $dbMem = ""
  if ($stats) {
    $parts = $stats.Split(";")
    $dbCpu = $parts[0].TrimEnd("%")
    $m = [regex]::Match($parts[1], "^([\d.]+)\s*([KMG]i?B)")
    if ($m.Success) {
      $v = [double]$m.Groups[1].Value
      switch -Regex ($m.Groups[2].Value) { "^G" { $v *= 1024 } "^K" { $v /= 1024 } }
      $dbMem = [math]::Round($v, 0)
    }
  }
  "{0},{1},{2},{3},{4}" -f $now.ToString("o"), $apiCpu, $apiMem, $dbCpu, $dbMem | Out-File -FilePath $Out -Append -Encoding ascii
}
