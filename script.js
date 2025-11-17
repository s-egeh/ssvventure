document.addEventListener('DOMContentLoaded', function() {
    // Initialize AOS (Animate on Scroll)
    AOS.init({
        duration: 800,
        once: true,
        offset: 50,
    });

    // --- SCROLL PROGRESS BAR ---
    const scrollProgress = document.getElementById('scroll-progress');
    if (scrollProgress) {
        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scrollPercentage = (scrollTop / scrollHeight) * 100;
            scrollProgress.style.width = scrollPercentage + '%';
        });
    }

    // --- MOBILE MENU TOGGLE ---
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            mobileMenuButton.classList.toggle('active');
            
            // Animate hamburger icon
            const spans = mobileMenuButton.querySelectorAll('span');
            if (!mobileMenu.classList.contains('hidden')) {
                spans[0].style.transform = 'translateY(7px) rotate(45deg)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
            } else {
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            }
        });
        
        // Close mobile menu when clicking a link
        const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
                const spans = mobileMenuButton.querySelectorAll('span');
                spans[0].style.transform = 'none';
                spans[1].style.opacity = '1';
                spans[2].style.transform = 'none';
            });
        });
    }

    // --- TEAM MEMBER "READ MORE" TOGGLE ---
    document.querySelectorAll('.team-member .read-more-btn').forEach(button => {
        button.addEventListener('click', function() {
            const teamMemberCard = this.closest('.team-member');
            const shortDescription = teamMemberCard.querySelector('.short-description');
            const fullDescription = teamMemberCard.querySelector('.full-description');

            if (fullDescription.classList.contains('hidden')) {
                shortDescription.classList.add('hidden');
                fullDescription.classList.remove('hidden');
                this.textContent = 'Read Less';
            } else {
                shortDescription.classList.remove('hidden');
                fullDescription.classList.add('hidden');
                this.textContent = 'Read More';
            }
        });
    });

    // --- CONTACT FORM SUBMISSION (NEW & IMPROVED) ---
    const form = document.getElementById("contact-form");
    const emailInput = document.getElementById("email");
    const validationMsg = document.getElementById("form-validation");
    const successMsg = document.getElementById("form-success");
    const errorMsg = document.getElementById("form-error");
    const submitBtn = document.getElementById("submit-btn");
    const btnText = document.getElementById("btn-text");
    const btnSpinner = document.getElementById("btn-spinner");

    if (form) {
        form.addEventListener("submit", async function (e) {
            e.preventDefault();

            // --- My Added Surprise: Instant validation before sending ---
            if (emailInput.value.trim() === '') {
                validationMsg.classList.remove("hidden");
                // Hide other messages
                successMsg.classList.add("hidden");
                errorMsg.classList.add("hidden");
                emailInput.focus();
                return; // Stop the function here
            }
            validationMsg.classList.add("hidden");
            // --- End of my addition ---

            // Show spinner and disable button
            btnText.textContent = "Sending...";
            btnSpinner.classList.remove("hidden");
            submitBtn.disabled = true;

            const formData = new FormData(form);
            try {
                const response = await fetch(form.action, {
                    method: form.method,
                    body: formData,
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    successMsg.classList.remove("hidden");
                    errorMsg.classList.add("hidden");
                    form.reset();
                } else {
                    // This will trigger the catch block for network errors
                    throw new Error("Form submission failed");
                }
            } catch (error) {
                successMsg.classList.add("hidden");
                errorMsg.classList.remove("hidden");
            }

            // Reset button state after a short delay
            setTimeout(() => {
                btnText.textContent = "Submit Message";
                btnSpinner.classList.add("hidden");
                submitBtn.disabled = false;
            }, 1000);
        });
    }
});
// social-links.js
// An object to hold the SVG paths for each icon
const ICONS = {
  linkedin: <path d="M416 32H32C14.33 32 0 46.33 0 64v384c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32V64c0-17.67-14.33-32-32-32zM135.2 416H73.7c-9.2 0-16.7-7.5-16.7-16.7V174.6c0-9.2 7.5-16.7 16.7-16.7h61.5c9.2 0 16.7 7.5 16.7 16.7v224.7c0 9.2-7.5 16.7-16.7 16.7zm-30.8-251.2c-29.6 0-53.7-24.1-53.7-53.7 0-29.6 24.1-53.7 53.7-53.7 29.6 0 53.7 24.1 53.7 53.7 0 29.6-24.1 53.7-53.7 53.7zm285 251.2h-61.5c-9.2 0-16.7-7.5-16.7-16.7V297.8c0-16.6-4.3-29.8-19.1-29.8-11.7 0-19.1 7.9-22.3 17.5-1.1 3.2-1.7 7.7-1.7 12.2v118.5c0 9.2-7.5 16.7-16.7 16.7h-61.5c-9.2 0-16.7-7.5-16.7-16.7V174.6c0-9.2 7.5-16.7 16.7-16.7h61.5c9.2 0 16.7 7.5 16.7 16.7v18.7c4.6-8.5 12.1-16.7 27.6-16.7 30.6 0 53.7 20.9 53.7 66.5v120.4c.1 9.2-7.4 16.7-16.6 16.7z" />,
  twitter: <path d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.57 298.558-298.558 298.558-59.452 0-114.68-17.219-161.181-47.502 8.447.974 16.568 1.299 25.34 1.299 49.061 0 94.541-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.798.974 13.134 1.624 19.812 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.432 13.319-28.842-19.252-47.907-51.868-47.907-88.016 0-19.812 5.194-37.81 14.156-53.53 51.091 62.213 127.424 103.57 213.297 109.045-2.194-7.797-3.328-15.594-3.328-23.491 0-56.937 46.063-103.007 103.007-103.007 29.44 0 56.686 12.247 75.526 32.443 23.491-4.548 45.16-13.134 64.876-24.662-7.798 24.429-24.78 44.832-46.132 57.865 20.501-2.193 40.194-7.807 58.213-15.594-13.969 20.874-31.188 39.362-50.248 54.197z" />,
  instagram: <path d="M224.1 140.4c-33.2-5.3-43.2-8.3-48.4-8.8-15.3-1.7-27.1-.6-39 4.6-28.5 12.1-40.8 38.3-40.8 77.4V240h21.6c11.6 0 21 .2 21 2.3V447.3c0 11.6-.2 21-.6 21H120.3c-1.7-15.2-.6-27.1 4.6-39 12.1-28.5 38.3-40.8 77.4-40.8H224c33.2 5.3 43.2 8.3 48.4 8.8 15.3 1.7 27.1.6 39-4.6 28.5-12.1 40.8-38.3 40.8-77.4V240h-21.6c-11.6 0-21-.2-21-2.3V64.7c0-11.6.2-21 .6-21H327.7c1.7 15.2.6 27.1-4.6 39-12.1 28.5-38.3 40.8-77.4 40.8H224.1zm-.1-106.8C103.5 33.3 0 116.6 0 256s103.5 222.7 224 222.7 224-83.3 224-222.7S344.5 33.3 224 33.6zM224 380c-77.4 0-140-62.6-140-140s62.6-140 140-140 140 62.6 140 140-62.6 140-140 140z" />,
};

// Your list of social media profiles
export const SOCIAL_LINKS = [
  {
    name: "linkedin",
    href: "https://linkedin.com",
    icon: ICONS.linkedin,
  },
  {
    name: "twitter",
    href: "https://twitter.com",
    icon: ICONS.twitter,
  },
  {
    name: "instagram",
    href: "https://instagram.com",
    icon: ICONS.instagram,
  },
];
// YourComponent.jsx
import { SOCIAL_LINKS } from './social-links';

const Socials = () => {
  return (
    <div className="flex space-x-4 mt-4">
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="social-icon text-gray-500 hover:text-gray-900"
          aria-label={`Follow us on ${link.name}`}
        >
          <svg
            stroke="currentColor"
            fill="currentColor"
            strokeWidth="0"
            viewBox="0 0 448 512" // Use a consistent viewBox or adjust as needed
            className="h-6 w-6" // Control size with Tailwind
            xmlns="http://www.w3.org/2000/svg"
          >
            {link.icon}
          </svg>
        </a>
      ))}
    </div>
  );
};

export default Socials;