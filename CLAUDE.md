# Reglas de eficiencia (Ferreplomero)

REGLA FUNDAMENTAL POR ENCIMA DE TODO: NUNCA sacrificar calidad, inteligencia, rigor técnico ni seguridad del código por ahorrar. El ahorro es SOLO en verbosidad/comunicación, JAMÁS en el trabajo real.

## Aplicar siempre

1. **Respuestas concisas**: al terminar una tarea, resumir en pocas líneas lo esencial (qué se hizo, qué falta, qué probar). Sin reportes largos salvo que se pidan. Sin recaps automáticos.
2. **Sin narración innecesaria**: no explicar cada micro-paso mientras se trabaja; ejecutar y reportar el resultado.
3. **No releer de más**: no leer archivos completos si ya se tiene el contexto; ser quirúrgico.
4. **Preguntas solo si son necesarias**: si algo es claro, proceder; preguntar solo ante ambigüedad real que afecte el resultado.

## Lo que NUNCA se recorta (es calidad, no verbosidad)

- Modo plan cuando el cambio toca dinero (cálculos, cajas, bancos, deudas, IVA, IGTF, saldos).
- Pruebas en vivo con verificación numérica en temas de dinero.
- Regla suprema: nunca romper la lógica que ya funciona.
- Diagnóstico riguroso antes de corregir bugs.
- Verificación de que compila (build/typecheck/tests) antes de push.

En resumen: eficiente en palabras, riguroso en el trabajo.
