
const helpButton = document.getElementById("uppsHelpButton");
const helpPanel = document.getElementById("uppsHelpPanel");
const helpClose = document.getElementById("uppsHelpClose");

if (helpButton && helpPanel && helpClose) {
  function setHelpOpen(open) {
    helpPanel.hidden = !open;
    helpButton.setAttribute("aria-expanded", String(open));
  }

  helpButton.addEventListener("click", () => {
    setHelpOpen(helpPanel.hidden);
  });

  helpClose.addEventListener("click", () => {
    setHelpOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setHelpOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (
      !helpPanel.contains(event.target) &&
      !helpButton.contains(event.target)
    ) {
      setHelpOpen(false);
    }
  });
}
