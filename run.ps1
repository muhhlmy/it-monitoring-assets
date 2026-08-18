$backend = "C:\Users\Helmy\Documents\Magang\Projects\it-monitoring-assets\backend"
$frontend = "C:\Users\Helmy\Documents\Magang\Projects\it-monitoring-assets\frontend"

Start-Process powershell.exe `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$backend'; npm run dev`"" `
    -WindowStyle Hidden

Start-Process powershell.exe `
    -ArgumentList "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$frontend'; npm run dev`"" `
    -WindowStyle Hidden