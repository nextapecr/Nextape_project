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

Genera el tuyo en SonarCloud → *My Account → Security → Generate Tokens*. Este documento y
`sonar-scan.ps1` tenían un token real escrito (2026-10-07 → 2026-10-28); se quitó, pero sigue en el
historial de git: **ese token debe revocarse** en SonarCloud.

```powershell
# Temporal (solo sesión actual de PowerShell)
$env:SONAR_TOKEN = "<tu-token-de-sonarcloud>"

# Permanente (recomendado, persiste entre sesiones)
[System.Environment]::SetEnvironmentVariable('SONAR_TOKEN','<tu-token-de-sonarcloud>','User')
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
$env:SONAR_TOKEN = "<tu-token-de-sonarcloud>"
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
2. Agrega `SONAR_TOKEN` con el valor `<tu-token-de-sonarcloud>`

---

## 📚 Referencias

- [SonarCloud Docs](https://docs.sonarsource.com/sonarcloud/)
- [SonarScanner CLI](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/scanners/sonarscanner/)
- [Analysis Parameters](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/analysis-parameters/)
- [TypeScript Analysis](https://docs.sonarsource.com/sonarqube/latest/analyzing-source-code/languages/typescript/)

---

## 🧾 Última auditoría (2026-10-28, rama `test-vernon`)

SonarCloud no era accesible desde el entorno de la auditoría, así que se corrieron **las mismas reglas
de TypeScript** con el plugin oficial de SonarSource para ESLint (`eslint-plugin-sonarjs@3`, perfil
`recommended`), sin añadirlo al proyecto:

```bash
npm i --no-save eslint-plugin-sonarjs@3
npx eslint -c sonar.eslint.tmp.mjs --no-config-lookup .   # config temporal con sonarjs.configs.recommended
```

**236 hallazgos → 0 en `src/`** (quedan 6 de complejidad en scripts, ver `docs/TECH_DEBT.md`).
Lo más relevante:
- **Seguridad:** token de SonarCloud escrito en `sonar-scan.ps1` y en este documento (quitado; **revocarlo**,
  sigue en el historial). Regex con backtracking superlineal sobre salida del modelo (`src/ai/generate.ts`).
  Sorteo de preguntas con `crypto.randomInt` en vez de `Math.random`.
- **Bugs:** comparaciones siempre verdaderas por tipos, `sort()` que mutaba el array de entrada, contador de
  bucle mal ubicado.
- **Tests:** `oauth/revoke/route.test.ts` probaba constantes copiadas (pasaba aunque el handler cambiara);
  ahora prueba `src/lib/server/github-revoke.ts`, la lógica real extraída del handler.
- **Deprecaciones:** `React.ElementRef` → `ComponentRef`; icono `Github` de lucide → `GithubIcon` (simple-icons).

Revisados como seguros y marcados con `// NOSONAR <regla> — motivo` (SonarQube los respeta; el plugin de
ESLint no): sha1 de huella de pregunta (`line-policy.ts`), `Math.random` decorativo y de ids de log, y
literales `http://`/`javascript:` en tests que prueban justamente su manejo.

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
