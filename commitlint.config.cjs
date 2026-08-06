/**
 * Conventional Commits con mensajes en español.
 * Tipos permitidos y reglas de formato para mantener un historial limpio.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // nueva funcionalidad
        "fix", // corrección de error
        "docs", // documentación
        "style", // formato (sin cambios de lógica)
        "refactor", // refactor sin cambio de comportamiento
        "perf", // mejora de rendimiento
        "test", // pruebas
        "build", // sistema de build o dependencias
        "ci", // integración continua
        "chore", // tareas varias
        "revert", // revertir un commit
      ],
    ],
    "subject-case": [0], // permitimos español con mayúsculas/acentos
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    "header-max-length": [2, "always", 100],
  },
};
