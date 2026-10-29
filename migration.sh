#!/bin/bash

echo "🚀 Iniciando proceso de migración de NEXTAPE..."

# 1. Limpieza de Git local
echo "🧹 Reiniciando configuración de Git..."
rm -rf .git
git init

# 2. Limpiar credenciales de GitHub (Log out forzado)
echo "🔐 Eliminando credenciales guardadas para evitar Error 403..."
# Intentar cerrar el cache de credenciales
git credential-cache exit 2>/dev/null
# Desactivar helpers de credenciales temporales para forzar login
git config --global --unset credential.helper
git config --system --unset credential.helper

# 3. Configurar el origen correcto
REMOTE_URL="https://github.com/skrsoftwarecr/Nextape_project.git"
echo "🔗 Conectando con $REMOTE_URL..."
git remote add origin $REMOTE_URL

# 4. Preparar archivos
echo "📦 Preparando archivos (omitiendo node_modules)..."
git add .

# 5. Commit
echo "💾 Creando commit de migración..."
git commit -m "CORE: Full system migration to Next.js 15 + Genkit"

# 6. Rama migration
echo "🌿 Creando rama 'migration'..."
git branch -M migration

# 7. Intento de Push
echo ""
echo "⚠️  ATENCIÓN: Se te pedirán tus credenciales de GitHub ahora."
echo "💡 USERNAME: Usa la cuenta con permisos en el repositorio."
echo "💡 PASSWORD: Usa un 'Personal Access Token' (PAT), NO tu contraseña normal."
echo ""

git push -u origin migration

if [[ $? -eq 0 ]]; then
    echo "✅ Migración completada con éxito en la rama 'migration'."
else
    echo "❌ Error en el push. Verifica que tu cuenta tenga permisos de escritura en el repo."
fi
