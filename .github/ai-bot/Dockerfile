FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb
ARG PROVIDER
# Official CLI versions are deliberately pinned. No target dependencies are installed.
# Claude requires its native-binary placement step; run only that reviewed script.
RUN if [ "$PROVIDER" = "claude" ]; then npm install -g --ignore-scripts @anthropic-ai/claude-code@2.1.332 \
      && node "$(npm root -g)/@anthropic-ai/claude-code/install.cjs" \
      && claude --version; \
    elif [ "$PROVIDER" = "codex" ]; then npm install -g --ignore-scripts @openai/codex@0.172.0; \
    elif [ "$PROVIDER" != "broker" ]; then exit 1; fi
WORKDIR /opt/ai-bot
COPY package.json src/broker.js src/cli.js ./
RUN mkdir /work && chown node:node /work
USER node
WORKDIR /work
ENTRYPOINT ["node", "/opt/ai-bot/cli.js"]
