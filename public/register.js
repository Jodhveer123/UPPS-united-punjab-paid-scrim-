const form = document.getElementById("f");
const username = document.getElementById("u");
const displayName = document.getElementById("d");
const freeFireUid = document.getElementById("uid");
const email = document.getElementById("e");
const phone = document.getElementById("ph");
const password = document.getElementById("p");
const message = document.getElementById("m");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.textContent = "Creating account...";

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: username.value,
        displayName: displayName.value,
        freeFireUid: freeFireUid.value,
        email: email.value,
        phone: phone.value,
        password: password.value
      })
    });

    const result = await response.json();

    if (result.ok) {
      message.textContent = "Account created. Redirecting…";

      setTimeout(() => {
        location.href = "/login.html";
      }, 800);
    } else {
      message.textContent = result.error || "Registration failed.";
    }
  } catch (error) {
    console.error(error);
    message.textContent = "Unable to connect to the server.";
  }
});
