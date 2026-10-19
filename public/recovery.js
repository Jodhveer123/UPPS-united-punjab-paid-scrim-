const form = document.getElementById("recoveryForm");
const message = document.getElementById("recoveryMessage");
const button = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  button.disabled = true;
  button.textContent = "Submitting…";
  try {
    const response = await fetch("/api/auth/recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: document.getElementById("requestType").value,
        username: document.getElementById("username").value,
        contact: document.getElementById("contact").value,
        playerUid: document.getElementById("playerUid").value,
        details: document.getElementById("details").value
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit your request.");
    message.classList.add("success");
    message.textContent = data.message;
    form.reset();
  } catch (error) {
    message.classList.remove("success");
    message.textContent = error.message || "Unable to connect. Please try again.";
  } finally {
    button.disabled = false;
    button.textContent = "Submit recovery request";
  }
});
