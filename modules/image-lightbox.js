/**
 * Image Lightbox Handler
 *
 * Displays timeline images in a fullscreen lightbox when clicked.
 * Features:
 * - Fullscreen image view
 * - Close on ESC key, close button, or clicking outside
 * - Navigation between multiple images
 * - Smooth animations
 */

class ImageLightboxHandler extends BaseHandler {
  constructor() {
    super({ id: 'imageLightbox', cooldownTime: 0 }); // No cooldown needed for UI interactions
    this.lightboxContainer = null;
    this.currentImageIndex = 0;
    this.images = [];
  }

  async init(context) {
    // Only run in main window, not in iframes
    if (context.isIframe) {
      this.initialized = true;
      return;
    }

    console.log('[ImageLightbox] Initializing image lightbox handler');

    // Create lightbox container
    this.createLightboxContainer();

    // Set up click listeners for timeline images
    this.setupImageClickListeners();

    this.initialized = true;
    console.log('[ImageLightbox] Image lightbox handler initialized');
  }

  createLightboxContainer() {
    // Create lightbox overlay
    this.lightboxContainer = document.createElement('div');
    this.lightboxContainer.id = 'starbase-lightbox';
    this.lightboxContainer.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.95);
      z-index: 999999;
      justify-content: center;
      align-items: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // Close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.cssText = `
      position: absolute;
      top: 20px;
      right: 30px;
      background: transparent;
      border: none;
      color: white;
      font-size: 50px;
      font-weight: bold;
      cursor: pointer;
      z-index: 1000001;
      padding: 0;
      line-height: 40px;
      width: 50px;
      height: 50px;
      transition: color 0.2s;
    `;
    closeButton.onmouseover = () => closeButton.style.color = '#ccc';
    closeButton.onmouseout = () => closeButton.style.color = 'white';
    closeButton.onclick = (e) => {
      e.stopPropagation();
      this.closeLightbox();
    };

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.innerHTML = '&#10094;';
    prevButton.style.cssText = `
      position: absolute;
      left: 30px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 40px;
      font-weight: bold;
      cursor: pointer;
      z-index: 1000001;
      padding: 10px 20px;
      border-radius: 5px;
      transition: background 0.2s;
      display: none;
    `;
    prevButton.onmouseover = () => prevButton.style.background = 'rgba(255, 255, 255, 0.4)';
    prevButton.onmouseout = () => prevButton.style.background = 'rgba(255, 255, 255, 0.2)';
    prevButton.onclick = (e) => {
      e.stopPropagation();
      this.showPreviousImage();
    };

    // Next button
    const nextButton = document.createElement('button');
    nextButton.innerHTML = '&#10095;';
    nextButton.style.cssText = `
      position: absolute;
      right: 30px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 40px;
      font-weight: bold;
      cursor: pointer;
      z-index: 1000001;
      padding: 10px 20px;
      border-radius: 5px;
      transition: background 0.2s;
      display: none;
    `;
    nextButton.onmouseover = () => nextButton.style.background = 'rgba(255, 255, 255, 0.4)';
    nextButton.onmouseout = () => nextButton.style.background = 'rgba(255, 255, 255, 0.2)';
    nextButton.onclick = (e) => {
      e.stopPropagation();
      this.showNextImage();
    };

    // Image counter
    const counter = document.createElement('div');
    counter.id = 'starbase-lightbox-counter';
    counter.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      font-size: 18px;
      z-index: 1000001;
      background: rgba(0, 0, 0, 0.5);
      padding: 10px 20px;
      border-radius: 5px;
      display: none;
    `;

    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.id = 'starbase-lightbox-image-container';
    imageContainer.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    `;

    // Loading spinner
    const spinner = document.createElement('div');
    spinner.id = 'starbase-lightbox-spinner';
    spinner.style.cssText = `
      border: 5px solid rgba(255, 255, 255, 0.3);
      border-top: 5px solid white;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      position: absolute;
    `;

    // Add CSS animation for spinner
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    imageContainer.appendChild(spinner);

    // Assemble lightbox
    this.lightboxContainer.appendChild(closeButton);
    this.lightboxContainer.appendChild(prevButton);
    this.lightboxContainer.appendChild(nextButton);
    this.lightboxContainer.appendChild(counter);
    this.lightboxContainer.appendChild(imageContainer);

    // Add to document
    document.body.appendChild(this.lightboxContainer);

    // Close on click outside image
    this.lightboxContainer.onclick = (e) => {
      if (e.target === this.lightboxContainer) {
        this.closeLightbox();
      }
    };

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.lightboxContainer.style.display === 'flex') {
        this.closeLightbox();
      } else if (e.key === 'ArrowLeft' && this.lightboxContainer.style.display === 'flex') {
        this.showPreviousImage();
      } else if (e.key === 'ArrowRight' && this.lightboxContainer.style.display === 'flex') {
        this.showNextImage();
      }
    });

    console.log('[ImageLightbox] Lightbox container created');
  }

  setupImageClickListeners() {
    // Use event delegation for better performance and to handle dynamically added images
    document.addEventListener('click', (e) => {
      // Check if the clicked element is an image in the timeline
      const img = e.target.closest('img');
      if (!img) return;

      // Check if the image is within a timeline note
      const timelineRecord = img.closest('[id^="timeline_record_control"]');
      if (!timelineRecord) return;

      // Check if it's an inline image (not an avatar or icon)
      const imageWidget = img.closest('.image-inline');
      if (!imageWidget) return;

      console.log('[ImageLightbox] Timeline image clicked:', img.src);

      // Prevent default behavior
      e.preventDefault();
      e.stopPropagation();

      // Find all images in the same timeline record
      this.images = Array.from(timelineRecord.querySelectorAll('.image-inline img'))
        .map(imgEl => imgEl.src);

      // Find the index of the clicked image
      this.currentImageIndex = this.images.indexOf(img.src);

      // Open lightbox
      this.openLightbox(img.src);
    }, true); // Use capture phase to intercept before other handlers

    console.log('[ImageLightbox] Click listeners set up');
  }

  openLightbox(imageSrc) {
    const imageContainer = this.lightboxContainer.querySelector('#starbase-lightbox-image-container');
    const spinner = this.lightboxContainer.querySelector('#starbase-lightbox-spinner');
    const prevButton = this.lightboxContainer.querySelector('button:nth-child(2)');
    const nextButton = this.lightboxContainer.querySelector('button:nth-child(3)');
    const counter = this.lightboxContainer.querySelector('#starbase-lightbox-counter');

    // Show spinner
    spinner.style.display = 'block';

    // Clear previous image
    const existingImg = imageContainer.querySelector('img');
    if (existingImg) {
      existingImg.remove();
    }

    // Create new image
    const img = document.createElement('img');
    img.style.cssText = `
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: none;
      box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
    `;

    img.onload = () => {
      spinner.style.display = 'none';
      img.style.display = 'block';
    };

    img.onerror = () => {
      spinner.style.display = 'none';
      console.error('[ImageLightbox] Failed to load image:', imageSrc);
      notificationManager.error('Failed to load image', 3000);
      this.closeLightbox();
    };

    img.src = imageSrc;
    imageContainer.appendChild(img);

    // Show/hide navigation buttons based on number of images
    if (this.images.length > 1) {
      prevButton.style.display = 'block';
      nextButton.style.display = 'block';
      counter.style.display = 'block';
      counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;
    } else {
      prevButton.style.display = 'none';
      nextButton.style.display = 'none';
      counter.style.display = 'none';
    }

    // Show lightbox with fade-in animation
    this.lightboxContainer.style.display = 'flex';
    setTimeout(() => {
      this.lightboxContainer.style.opacity = '1';
    }, 10);

    console.log('[ImageLightbox] Lightbox opened');
  }

  closeLightbox() {
    // Fade out
    this.lightboxContainer.style.opacity = '0';

    setTimeout(() => {
      this.lightboxContainer.style.display = 'none';

      // Clear images array
      this.images = [];
      this.currentImageIndex = 0;
    }, 300);

    console.log('[ImageLightbox] Lightbox closed');
  }

  showNextImage() {
    if (this.images.length <= 1) return;

    this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
    this.openLightbox(this.images[this.currentImageIndex]);
  }

  showPreviousImage() {
    if (this.images.length <= 1) return;

    this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
    this.openLightbox(this.images[this.currentImageIndex]);
  }

  destroy() {
    if (this.lightboxContainer) {
      this.lightboxContainer.remove();
      this.lightboxContainer = null;
    }
    this.images = [];
    this.currentImageIndex = 0;
    console.log('[ImageLightbox] Handler destroyed');
  }
}

// Self-register with module registry
moduleRegistry.register({
  id: 'imageLightbox',
  name: 'Image Lightbox',
  description: 'Display timeline images in fullscreen lightbox when clicked',
  handler: new ImageLightboxHandler()
});
