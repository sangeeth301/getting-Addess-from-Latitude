import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import linkFilesToRecord from '@salesforce/apex/UploadPhotoParkingLog.linkFilesToRecord';
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

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Parking record created successfully. Linking uploaded files...',
                variant: 'success'
            })
        );
        this.clearFormFields();

        if (this.uploadedFileIds.length > 0) {
            linkFilesToRecord({ 
                recordId: this.ParkingLogrecordId, 
                fileIds: this.uploadedFileIds 
            })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Uploaded files have been linked to the record.',
                        variant: 'success'
                    })
                );
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
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Navigation Error',
                    message: 'Record ID is missing. Cannot navigate.',
                    variant: 'error'
                })
            );
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

    handleUploadFinished(event) {
        const uploadedFiles = event.detail.files;

        uploadedFiles.forEach(file => {
            this.uploadedFileIds.push(file.documentId);
        });

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: `${uploadedFiles.length} file(s) uploaded.`,
                variant: 'success'
            })
        );
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
                            this.dispatchEvent(
                                new ShowToastEvent({
                                    title: 'Error Getting Address',
                                    message: error.body.message,
                                    variant: 'error'
                                })
                            );
                        });

                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Success',
                            message: 'Location retrieved successfully.',
                            variant: 'success'
                        })
                    );

                    // If the ParkingLogrecordId already exists, update the record immediately
                    if (this.ParkingLogrecordId) {
                        this.updateLocation();
                    }
                },
                (error) => {
                    // Show the warning if location retrieval fails
                    this.showTurnOnMessage = true;

                    this.dispatchEvent(
                        new ShowToastEvent({
                            title: 'Error Getting Location',
                            message: error.message,
                            variant: 'error'
                        })
                    );
                }
            );
        } else {
            this.showTurnOnMessage = true;
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'Geolocation is not supported by this browser.',
                    variant: 'error'
                })
            );
        }
    }

    updateLocation() {
        updateParkingLogLocation({ 
            recordId: this.ParkingLogrecordId, 
            latitude: this.tempLatitude, 
            longitude: this.tempLongitude 
        })
        .then(() => {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Location updated successfully.',
                    variant: 'success'
                })
            );
        })
        .catch(error => {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error Updating Location',
                    message: error.body.message,
                    variant: 'error'
                })
            );
        });
    }
}