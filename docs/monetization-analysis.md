# Análise de Monetização — Justext Creator Repurpose

## Modelo Recomendado: Freemium com Limite Diário

### Divisão Gratuito vs Pago

| Feature | Free | Pro (~R$19,90/mês) |
|---------|------|-----|
| Transcrição limpa | ✅ Ilimitada | ✅ Ilimitada |
| Resumo estruturado | 3/dia | Ilimitado |
| Posts para redes | 1/dia | Ilimitado |
| Títulos/hooks/ângulos | 1/dia | Ilimitado |
| Copiar texto | ✅ | ✅ |
| Exportar .txt | ✅ | ✅ |
| Exportar .txt consolidado (todos outputs) | ❌ | ✅ |

### Custo Operacional por Processamento

| Item | Custo estimado |
|------|---------------|
| Transcrição (YouTube scraping) | $0.00 (sem API paga) |
| Resumo via Claude API (~2K tokens in, ~500 out) | ~$0.008 |
| Social Posts via Claude API (~2K in, ~800 out) | ~$0.012 |
| Hooks/Ângulos via Claude API (~2K in, ~600 out) | ~$0.010 |
| **Total por processamento completo** | **~$0.03** |

### Unit Economics

| Cenário | Cálculo |
|---------|---------|
| Usuário grátis (3 resumos + 1 social + 1 ideas/dia, 20 dias/mês) | ~$0.60/mês de custo |
| Usuário Pro (10 processamentos/dia, 20 dias/mês) | ~$6.00/mês de custo |
| Pro a R$19,90/mês (~$4.00) | Margem negativa se uso alto |
| Pro a R$29,90/mês (~$6.00) | Break-even com uso médio-alto |

**Nota:** Preço pode precisar de ajuste para $9.90/mês ou limitação de processamentos Pro (ex: 30/dia) para garantir margem. Ajustar após validação de uso real.

### Métricas de Validação Comercial

1. **Tração:** >100 usos/dia nos primeiros 30 dias
2. **Conversão:** >5% dos usuários atingem limite grátis
3. **Intenção:** >2% clicam em "ver plano pro"
4. **Retenção:** >30% dos usuários voltam na mesma semana

### Público com Maior Propensão a Pagar

1. **Social media managers** — processam múltiplos vídeos/dia para clientes
2. **Creators de YouTube** — querem replicar seu conteúdo em outras plataformas
3. **Produtores de newsletter** — transformam vídeos em conteúdo escrito semanalmente
4. **Estudantes de conteúdo** — consomem vídeos educacionais e querem resumos rápidos (menor disposição $)
