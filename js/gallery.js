document.addEventListener('DOMContentLoaded', () => {
    const uploadInput = document.getElementById('imageUpload');
    const galleryContainer = document.getElementById('galleryContainer');

    // Load gallery from local storage
    loadGallery();

    // Handle new image upload
    uploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                // Save original image to localStorage and transition to editor
                const imgData = event.target.result;
                const projectId = 'project_' + Date.now();
                
                const projectData = {
                    id: projectId,
                    original: imgData,
                    progress: null, // Will hold canvas data URL
                    status: 'In Progress'
                };
                
                localStorage.setItem(projectId, JSON.stringify(projectData));
                localStorage.setItem('currentProject', projectId);
                window.location.href = 'editor.html';
            };
            reader.readAsDataURL(file);
        }
    });

    function loadGallery() {
        galleryContainer.innerHTML = '';
        const keys = Object.keys(localStorage).filter(k => k.startsWith('project_'));
        
        keys.forEach(key => {
            const data = JSON.parse(localStorage.getItem(key));
            const div = document.createElement('div');
            div.className = 'gallery-item';
            
            // Show progress if exists, otherwise original
            const displayImg = data.progress ? data.progress : data.original;
            
            div.innerHTML = `
                <img src="${displayImg}" alt="Artwork">
                <p>Status: ${data.status}</p>
            `;
            
            div.addEventListener('click', () => {
                localStorage.setItem('currentProject', data.id);
                window.location.href = 'editor.html';
            });
            
            galleryContainer.appendChild(div);
        });
    }
});
