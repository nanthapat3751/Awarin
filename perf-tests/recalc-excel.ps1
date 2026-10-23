# คำนวณสูตรทั้งไฟล์ด้วย Excel จริง แล้วบันทึกทับ (ให้ไฟล์มีค่าที่คำนวณแล้ว) + รายงานช่องที่เป็น error
#   powershell -File recalc-excel.ps1 -Path report.xlsx
param([Parameter(Mandatory = $true)][string]$Path)

$full = (Resolve-Path $Path).Path
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open($full)
  $excel.CalculateFull()
  $formulas = 0
  $errors = @()
  foreach ($ws in $wb.Worksheets) {
    $used = $ws.UsedRange
    foreach ($cell in $used.Cells) {
      if ($cell.HasFormula) {
        $formulas++
        $t = $cell.Text
        if ($t -match '^#(NAME\?|VALUE!|REF!|DIV/0!|N/A|NUM!|NULL!)') { $errors += "$($ws.Name)!$($cell.Address($false, $false)) = $t" }
      }
    }
  }
  $wb.Save()
  $wb.Close($false)
  "formulas=$formulas errors=$($errors.Count)"
  $errors | Select-Object -First 30
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
