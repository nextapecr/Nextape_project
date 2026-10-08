# 🔍 SonarQube/SonarCloud Setup

Guía para configurar y ejecutar análisis de código con SonarQube/SonarCloud en el proyecto Nextape.

---

## 📋 Pre-requisitos

- **Sistema operativo:** Windows
- **Node.js:** v20+
- **PowerShell:** 5.1+ (incluido en Windows 10/11)

---

## 🚀 Setup Rápido (Primera vez)

### 1. Descargar SonarScanner

```powershell
# Descarga (~58MB)
$env:SONAR_SCANNER_VERSION = "8.1.0.6389"
$env:SONAR_SCANNER_HOME = "$env:USERPROFILE\.sonar\sonar-scanner-$env:SONAR_SCANNER_VERSION-windows-x64"

New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.sonar" | Out-Null

Invoke-WebRequest `
  -Uri "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-$env:SONAR_SCANNER_VERSION-windows-x64.zip" `
  -OutFile "$env:USERPROFILE\.sonar\sonar-scanner.zip"

# Descomprimir
Expand-Archive `
  -Path "$env:USERPROFILE\.sonar\sonar-scanner.zip" `
  -DestinationPath "$env:USERPROFILE\.sonar" `
  -Force

Write-Host "✅ SonarScanner instalado en: $env:SONAR_SCANNER_HOME"
```

### 2. Configurar Token de Autenticación

**⚠️ IMPORTANTE:** El token es **secreto**, no lo compartas ni lo subas a git.

```powershell
# Temporal (solo sesión actual de PowerShell)
$env:SONAR_TOKEN = "f99c95a1a30829d7da97d4512d9e240b68f571fa"

# Permanente (recomendado, persiste entre sesiones)
[System.Environment]::SetEnvironmentVariable('SONAR_TOKEN','f99c95a1a30829d7da97d4512d9e240b68f571fa','User')
```

**Verificar:**
```powershell
$env:SONAR_TOKEN  # Debe mostrar el token
```

---

## 🎯 Ejecutar Análisis

### Opción 1: Script PowerShell (Recomendado)

```powershell
# Desde la raíz del proyecto
.\sonar-scan.ps1
```

**Validar configuración (sin ejecutar análisis):**
```powershell
.\sonar-scan.ps1 -DryRun
```

### Opción 2: Comando directo

```powershell
# Agregar SonarScanner al PATH (sesión actual)
$env:SONAR_SCANNER_VERSION = "8.1.0.6389"
$env:SONAR_SCANNER_HOME = "$env:USERPROFILE\.sonar\sonar-scanner-$env:SONAR_SCANNER_VERSION-windows-x64"
$env:PATH = "$env:SONAR_SCANNER_HOME\bin;$env:PATH"

# Ejecutar análisis
sonar-scanner `
  -Dsonar.organization=skrsoftwarecr1 `
  -Dsonar.projectKey=skrsoftwarecr_nextape
```

### Opción 3: npm script

```bash
npm run sonar
```

---

## 📊 Ver Resultados

Una vez completado el análisis, los resultados están disponibles en:

**🔗 https://sonarcloud.io/project/overview?id=skrsoftwarecr_nextape**

---

## ⚙️ Configuración del Proyecto

El análisis está configurado en `sonar-project.properties`:

```properties
# Organización y proyecto
sonar.organization=skrsoftwarecr1
sonar.projectKey=skrsoftwarecr_nextape
sonar.projectName=Nextape
sonar.projectVersion=0.1.0

# Fuentes a analizar
sonar.sources=src,app

# Tests
sonar.tests=src,app
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx

# Exclusiones (archivos ignorados)
sonar.exclusions=\
  **/*.test.ts,\
  **/*.test.tsx,\
  **/node_modules/**,\
  **/.next/**,\
  **/build/**,\
  **/coverage/**,\
  **/.wrangler/**,\
  **/scripts/**
```

**Modificar exclusiones:**

Edita `sonar-project.properties` y agrega/quita patrones en `sonar.exclusions`.

---

## 🧪 Análisis con Coverage (Opcional)

Si ejecutas tests con coverage, SonarQube puede mostrar métricas de cobertura:

### 1. Generar coverage

```bash
npm run test -- --coverage
```

Esto genera `coverage/lcov.info`.

### 2. Habilitar en configuración

Descomenta en `sonar-project.properties`:

```properties
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.typescript.lcov.reportPaths=coverage/lcov.info
```

### 3. Ejecutar análisis

```powershell
.\sonar-scan.ps1
```

---

## 🔧 Troubleshooting

### ❌ "sonar-scanner: command not found"

**Causa:** SonarScanner no está en el PATH.

**Solución:**
```powershell
$env:SONAR_SCANNER_VERSION = "8.1.0.6389"
$env:SONAR_SCANNER_HOME = "$env:USERPROFILE\.sonar\sonar-scanner-$env:SONAR_SCANNER_VERSION-windows-x64"
$env:PATH = "$env:SONAR_SCANNER_HOME\bin;$env:PATH"
```

### ❌ "Invalid token" o "401 Unauthorized"

**Causa:** `SONAR_TOKEN` no configurado o inválido.

**Solución:**
```powershell
# Verificar token
$env:SONAR_TOKEN

# Si está vacío o incorrecto, configurarlo:
$env:SONAR_TOKEN = "f99c95a1a30829d7da97d4512d9e240b68f571fa"
```

### ❌ "Project key already exists"

**Causa:** Ya existe un proyecto con esa clave en SonarCloud.

**Solución:**
- Usa el proyecto existente (el análisis se actualizará)
- O cambia `sonar.projectKey` en `sonar-project.properties`

### ⚠️ "No coverage information found"

**Causa:** No se generó el archivo `coverage/lcov.info`.

**Solución:**
```bash
npm run test -- --coverage
```

---

## 🏗️ Integración CI/CD (Futuro)

Para ejecutar el análisis automáticamente en GitHub Actions, Netlify, o Firebase:

### GitHub Actions

Crea `.github/workflows/sonar.yml`:

```yaml
name: SonarCloud Analysis

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  sonar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history para SonarCloud

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test -- --coverage

      - name: SonarCloud Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

**Configurar secreto:**
1. Ve a Settings → Secrets → Actions
2. Agrega `SONAR_TOKEN` con el valor `f99c95a1a30829d7da97d4512d9e240b68f571fa`

---

## 📚 Referencias

- [SonarCloud Docs](https://docs.sonarsource.com/sonarcloud/)
- [SonarScanner CLI](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/)
- [Analysis Parameters](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/analysis-parameters/)
- [TypeScript Analysis](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/languages/typescript/)

---

## ✅ Checklist de Setup

- [ ] SonarScanner descargado y descomprimido
- [ ] Variable `SONAR_TOKEN` configurada
- [ ] Archivo `sonar-project.properties` revisado
- [ ] Primer análisis ejecutado con `.\sonar-scan.ps1`
- [ ] Resultados visibles en SonarCloud
- [ ] (Opcional) Coverage configurado
- [ ] (Opcional) CI/CD integrado

---

**¿Problemas?** Revisa la sección de Troubleshooting o abre un issue en el repositorio.
