param(
  [string]$DbName = "my app",
  [string]$DbUser = "postgres",
  [string]$DbHost = "localhost",
  [int]$DbPort = 5432,
  [string]$PsqlPath = "psql"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$tablesDir = Join-Path $projectRoot "tables"

$sqlFiles = @(
  "users.sql",
  "documents.sql",
  "quizzes.sql",
  "quiz_questions.sql",
  "flashcard_sets.sql",
  "flashcards.sql",
  "activity.sql"
)

Write-Host "Bootstrapping database schema..."
Write-Host "Database : $DbName"
Write-Host "User     : $DbUser"
Write-Host "Host     : $DbHost"
Write-Host "Port     : $DbPort"
Write-Host ""

# Ensure user schema exists so unqualified CREATE TABLE works
# when search_path starts with "$user".
Write-Host "Ensuring schema '$DbUser' exists ..."
& $PsqlPath -v ON_ERROR_STOP=1 -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "CREATE SCHEMA IF NOT EXISTS $DbUser AUTHORIZATION $DbUser;"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create schema '$DbUser'"
}

foreach ($file in $sqlFiles) {
  $fullPath = Join-Path $tablesDir $file
  if (-not (Test-Path $fullPath)) {
    throw "Missing SQL file: $fullPath"
  }

  Write-Host "Applying $file ..."
  & $PsqlPath -v ON_ERROR_STOP=1 -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $fullPath

  if ($LASTEXITCODE -ne 0) {
    throw "Failed while applying $file"
  }
}

Write-Host ""
Write-Host "Database bootstrap completed successfully."
