// 1. Set Copyright Year
document.getElementById("year").textContent = new Date().getFullYear();

// 2. Carousel Logic
const track = document.getElementById("track");
const slides = Array.from(track.children);
const dots = document.querySelectorAll(".carousel-dot");
let currentSlideIndex = 0;

function updateSlide(index) {
  // Move the track
  const amountToMove = -100 * index;
  track.style.transform = `translateX(${amountToMove}%)`;

  // Update dots
  dots.forEach((dot) => dot.classList.remove("active"));
  if (dots[index]) dots[index].classList.add("active");

  currentSlideIndex = index;
}

// Auto Play Function
function autoPlay() {
  let nextIndex = currentSlideIndex + 1;
  if (nextIndex >= slides.length) {
    nextIndex = 0; // Loop back to start
  }
  updateSlide(nextIndex);
}

// Change slide every 3 seconds (3000ms)
setInterval(autoPlay, 3000);

// Add click events to dots (optional)
dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    updateSlide(index);
  });
});
