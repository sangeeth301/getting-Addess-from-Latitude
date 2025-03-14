import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import linkFilesToRecord from '@salesforce/apex/UploadPhotoParkingLog.linkFilesToRecord';
import uploadFile from '@salesforce/apex/UploadPhotoParkingLog.uploadFile';
import updateParkingLogLocation from '@salesforce/apex/UploadPhotoParkingLog.updateParkingLogLocation';
import getAddressFromCoordinates from '@salesforce/apex/ReverseGeocodeService.getAddressFromCoordinates';

export default class BackOnTruck extends NavigationMixin(LightningElement) {
    @api recordId;
    @track ParkingLogrecordId;
    @track latitude;
    @track longitude;
    tempLatitude;
    tempLongitude;
    uploadedFileIds = [];
    isModalOpen = true;
    mapurl;
    @track showTurnOnMessage = true;
    @track currentAddress;

    connectedCallback() {
        this.getCurrentLocation(); // Call the method automatically when the component loads
    }

    handleSuccess(event) {
        this.ParkingLogrecordId = event.detail.id;

        this.showSuccessToast('Parking record created successfully. Linking uploaded files...');
        this.clearFormFields();

        if (this.uploadedFileIds.length > 0) {
            linkFilesToRecord({ 
                recordId: this.ParkingLogrecordId, 
                fileIds: this.uploadedFileIds 
            })
            .then(() => {
                this.showSuccessToast('Uploaded files have been linked to the record.');
            })
            .catch(error => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error Linking Files',
                        message: error.body.message,
                        variant: 'error'
                    })
                );
            });
        }

        // If latitude and longitude were captured earlier, update the Parking Log record
        if (this.tempLatitude && this.tempLongitude) {
            this.updateLocation();
        }

        // Navigate to the newly created record immediately
        this.navigateToRecord();
    }

    navigateToRecord() {
        if (this.recordId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.recordId,
                    objectApiName: 'Dumpsters__c',
                    actionName: 'view'
                }
            });
        } else {
             this.showErrorToast('Record ID is missing. Cannot navigate.');
        }
    }

    handleError(event) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: event.detail.message,
                variant: 'error'
            })
        );
    }

    async handleFileChange(event) {
        const file = event.target.files[0];

        if (file) {
            try {
                const compressedBlob = await this.compressImage(file);
                this.uploadImage(compressedBlob, file.name, file.type);
            } catch (error) {
                console.error('Compression Error:', error);
                this.showErrorToast('Error', 'Image compression failed.');
            }
        }
    }

    async compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;

                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    const MAX_WIDTH = 800; // Resize width
                    const scaleSize = MAX_WIDTH / img.width;
                    canvas.width = Math.round(MAX_WIDTH);
                    canvas.height = Math.round(img.height * scaleSize);

                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(new Error('Canvas to Blob conversion failed'));
                            }
                        },
                        file.type === 'image/png' ? 'image/png' : 'image/jpeg', // Output format
                        0.7 // Compression quality (0-1)
                    );
                };
                img.onerror = () => reject(new Error('Image load error'));
            };
            reader.onerror = () => reject(new Error('FileReader error'));
        });
    }

    uploadImage(fileBlob, fileName, fileType) {
        const reader = new FileReader();
        reader.readAsDataURL(fileBlob);
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];

            uploadFile({ fileName, fileType, base64Data: base64String })
                .then((fileId) => {
                    this.uploadedFileIds.push(fileId);
                    this.showSuccessToast('Success', 'Image uploaded successfully.');
                })
                .catch((error) => {
                    console.error('Upload Error:', error);
                    this.showErrorToast('Failed to upload image.');
                });
        };
    }

    clearFormFields() {
        const inputFields = this.template.querySelectorAll('lightning-input-field');
        inputFields.forEach(field => {
            field.reset();
        });
    }

    closeModal() {
        this.navigateToRecord();
    }

    getCurrentLocation() {
        this.currentAddress = '';
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.tempLatitude = position.coords.latitude;
                    this.tempLongitude = position.coords.longitude;

                    // Hide the warning since location was successfully retrieved
                    this.showTurnOnMessage = false;
                    this.mapurl = `https://www.google.com/maps/place/${this.tempLatitude}+${this.tempLongitude}/@12.9555556,80.2475,17z/data=!3m1!4b1!4m4!3m3!8m2!3d12.9555556!4d80.2475?entry=ttu&g_ep=EgoyMDI1MDMwNC4wIKXMDSoASAFQAw%3D%3D`;

                    getAddressFromCoordinates({ latitude: this.tempLatitude, longitude: this.tempLongitude })
                        .then(address => {
                            if (address) {
                                this.currentAddress = address;
                                // Update the Parking Log record with the retrieved address
                                // You can call another Apex method here to update the address if needed
                            }
                        })
                        .catch(error => {
                             this.showErrorToast('Error Getting Address');
                        });

                    this.showSuccessToast('Location retrieved successfully.');

                },
                (error) => {
                    // Show the warning if location retrieval fails
                    this.showTurnOnMessage = true;

                     this.showErrorToast('Error Getting Location');
                }
            );
        } else {
            this.showTurnOnMessage = true;
             this.showErrorToast('Geolocation is not supported by this browser.');
        }
    }

    updateLocation() {
        updateParkingLogLocation({ 
            recordId: this.ParkingLogrecordId, 
            latitude: this.tempLatitude, 
            longitude: this.tempLongitude 
        })
        .then(() => {
            this.showSuccessToast('Location updated successfully.');
        })
        .catch(error => {
             this.showErrorToast('Error Updating Location');
        });
    }

    showSuccessToast(title, message) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: 'success'
        });
        this.dispatchEvent(evt);
    }

    showErrorToast(title, message) {
    const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: 'error'
        });
        this.dispatchEvent(evt);
    }
}