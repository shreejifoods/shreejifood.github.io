// Load the EmailJS script dynamically
const script = document.createElement("script");
script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
script.type = "text/javascript";
script.onload = function () {
    // Initialize EmailJS
    emailjs.init("byjrGBN3r1SvvFFhJ"); // Replace with your EmailJS public key
};
script.onerror = function () {
    console.error("Failed to load the EmailJS script.");
};
document.head.appendChild(script);

// Define the sendEmail function
function sendEmail() {
    // Validate required fields
    var name = document.getElementById("name").value;
    var email = document.getElementById("email").value;
    var phone = document.getElementById("phone").value;
    var message = document.getElementById("message").value;

    if (!name || !email || !phone || !message) {
        alert("Please fill in all required fields.");
        return; // Stop the function if validation fails
    }

    var templateParams = {
        name: name,
        email: email,
        phone: phone,
        message: message,
    };

    // Send the email only if EmailJS is defined
    if (typeof emailjs !== "undefined") {
        emailjs
            .send("service_ejwyzx8", "template_djqwoxj", templateParams) // Your EmailJS service and template IDs
            .then(function (response) {
                console.log("SUCCESS!", response.status, response.text);
                alert("Email sent successfully!");
                document.getElementById("contact-form").reset();
            })
            .catch(function (error) {
                console.error("FAILED...", error);
                alert("Failed to send email. Please try again later.");
            });
    } else {
        alert("Email service is currently unavailable. Please try again later.");
    }
}
