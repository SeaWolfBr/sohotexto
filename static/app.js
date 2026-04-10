const appState = {
  authenticated: false,
  result: null,
};

const elements = {
  authLayer: document.querySelector("#authLayer"),
  authForm: document.querySelector("#authForm"),
  authStatus: document.querySelector("#authStatus"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  transcriptForm: document.querySelector("#transcriptForm"),
  videoUrl: document.querySelector("#videoUrl"),
  primaryActions: document.querySelector("#primaryActions"),
  statusMessage: document.querySelector("#statusMessage"),
  submitButton: document.querySelector("#submitButton"),
  clearButton: document.querySelector("#clearButton"),
  logoutButton: document.querySelector("#logoutButton"),
  openWorkspaceLink: document.querySelector("#openWorkspaceLink"),
  resultSection: document.querySelector("#resultSection"),
  resultTitle: document.querySelector("#resultTitle"),
  transcriptOutput: document.querySelector("#transcriptOutput"),
  copyButton: document.querySelector("#copyButton"),
  downloadTxtButton: document.querySelector("#downloadTxtButton"),
};

async function parseJson(response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Nao foi possivel completar a operacao.");
  }

  return data;
}

function setStatus(message, tone = "default") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.style.color =
    tone === "error" ? "#8f4a33" : tone === "good" ? "#2b6b53" : "";
}

function setAuthStatus(message, tone = "default") {
  elements.authStatus.textContent = message;
  elements.authStatus.style.color =
    tone === "error" ? "#8f4a33" : tone === "good" ? "#2b6b53" : "";
}

function setAuthenticated(value) {
  appState.authenticated = value;
  elements.authLayer.classList.toggle("hidden", value);
  elements.primaryActions.classList.toggle("hidden", !value);
  elements.logoutButton.classList.toggle("hidden", !value);
  elements.openWorkspaceLink.classList.toggle("hidden", !value);

  if (!value) {
    elements.resultSection.classList.add("hidden");
  }
}

function downloadContent(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderResult(result) {
  appState.result = result;
  elements.resultSection.classList.remove("hidden");
  elements.resultTitle.textContent = result.title || "transcricao pronta";
  elements.transcriptOutput.value = result.text || "";
}

async function refreshSession() {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    const data = await parseJson(response);
    setAuthenticated(Boolean(data.authenticated));
    setStatus(
      data.authenticated
        ? "cole a url e clique em transcrever"
        : "entre com usuario e senha para liberar a ferramenta",
    );
  } catch {
    setAuthenticated(false);
    setStatus("nao foi possivel verificar a sessao", "error");
  }
}

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthStatus("verificando credenciais...");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: elements.username.value,
        password: elements.password.value,
      }),
    });

    await parseJson(response);
    elements.password.value = "";
    setAuthStatus("");
    setAuthenticated(true);
    setStatus("acesso liberado. cole a url e clique em transcrever", "good");
  } catch (error) {
    setAuthStatus(
      error instanceof Error ? error.message : "nao foi possivel validar o login",
      "error",
    );
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  setAuthenticated(false);
  setStatus("sessao encerrada", "default");
});

elements.transcriptForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = elements.videoUrl.value.trim();

  if (!url) {
    setStatus("cole uma url do YouTube para continuar", "error");
    return;
  }

  elements.submitButton.disabled = true;
  setStatus("buscando legenda e limpando o texto...");

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const data = await parseJson(response);
    renderResult(data.result);
    setStatus("transcricao pronta", "good");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "nao foi possivel gerar a transcricao",
      "error",
    );
  } finally {
    elements.submitButton.disabled = false;
  }
});

elements.clearButton.addEventListener("click", () => {
  elements.videoUrl.value = "";
  elements.resultSection.classList.add("hidden");
  elements.transcriptOutput.value = "";
  appState.result = null;
  setStatus("cole a url e clique em transcrever");
});

elements.copyButton.addEventListener("click", async () => {
  if (!appState.result?.text) return;

  try {
    await navigator.clipboard.writeText(appState.result.text);
    setStatus("texto copiado para a area de transferencia", "good");
  } catch {
    setStatus("nao foi possivel copiar automaticamente", "error");
  }
});

elements.downloadTxtButton.addEventListener("click", () => {
  if (!appState.result?.text) return;

  downloadContent(
    appState.result.text,
    appState.result.exports?.txtFileName || "transcricao.txt",
    "text/plain;charset=utf-8",
  );
});

refreshSession();
