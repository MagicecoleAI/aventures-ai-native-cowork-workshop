document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy);
    if (!target) return;

    try {
      await navigator.clipboard.writeText(target.innerText);
      const original = button.innerText;
      button.innerText = "복사됨";
      window.setTimeout(() => {
        button.innerText = original;
      }, 1400);
    } catch {
      button.innerText = "수동 복사";
    }
  });
});
