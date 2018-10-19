#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <ctype.h>

#include "pmd.h"
#include "usb-1024LS.h"

#define MAX_STR 255

// Compile with    gcc -g -Wall -I. -o get_heat get_heat.c -L. -lmccusb  -lm -L/usr/local/lib -lhidapi-libusb -lusb-1.0

void printBits(size_t const size, void const * const ptr)
{
    unsigned char *b = (unsigned char*) ptr;
    unsigned char byte;
    int i, j;

    for (i=size-1;i>=0;i--)
    {
        for (j=7;j>=0;j--)
        {
            byte = (b[i] >> j) & 1;
            printf("%u", byte);
        }
    }
    puts("");
}


/* Test Program */
int toContinue() 
{
  int answer;
  answer = 0; //answer = getchar();
  printf("Continue [yY]? ");
  while((answer = getchar()) == '\0' ||
	answer == '\n');
  return ( answer == 'y' || answer == 'Y');
}

int main (int argc, char **argv)
{
  int flag;
  uint8_t input, pin = 0; 
  int temp;
  int ch;
  hid_device* hid = 0x0;
  int ret;
  wchar_t serial[64];
  wchar_t wstr[MAX_STR];
  int interactive = 0;

  ret = hid_init();
  if (ret < 0) {
    fprintf(stderr, "hid_init failed with return code %d\n", ret);
    return -1;
  }

  if ((hid = hid_open(MCC_VID, USB1024LS_PID, NULL)) > 0) {
    printf("USB 1024LS Device is found!\n");
  } else if ((hid = hid_open(MCC_VID, USB1024HLS_PID, NULL)) > 0) {
    printf("USB 1024HLS Device is found!\n");
  } else {
    fprintf(stderr, "USB 1024LS and USB 1024HLS not found.\n");
    exit(1);
  }

  usbDConfigPort_USB1024LS(hid, DIO_PORTA, DIO_DIR_OUT);
  usbDConfigPort_USB1024LS(hid, DIO_PORTB, DIO_DIR_IN);
  usbDConfigPort_USB1024LS(hid, DIO_PORTC_LOW, DIO_DIR_OUT);
  usbDConfigPort_USB1024LS(hid, DIO_PORTC_HI, DIO_DIR_IN);
	
  for (int i = 1; i < argc; i++) {
		/* Check for a switch (leading "-"). */
		if (argv[i][0] == '-') {
		    /* Use the next character to decide what to do. */
		    switch (argv[i][1]) {
			case 'i':
				printf("Entering interactive mode\n");
				interactive = 1;
				break;
		    }
		}
	    }	
  
  while(interactive) {
    printf("\nUSB 1024 Testing\n");
    printf("----------------\n");
    printf("Hit 'b' to blink LED\n");
    printf("Hit 'i' for information\n");
    printf("Hit 'n' to get serial number\n");
    printf("Hit 'g' to get port status\n");
    printf("Hit 'c' to test counter \n");
    printf("Hit 'd' to test digital I/O \n");
    printf("Hit 'r' to reset the device.\n");
    printf("Hit 't' to test digital bit I/O\n");
    printf("Hit 'e' to exit\n");

    while((ch = getchar()) == '\0' || ch == '\n');
    
    switch(tolower(ch)) {
    case 'b': /* test to see if led blinks */
      usbBlink_USB1024LS(hid);
      break;
    case 'i':
      // Read the Manufacuter String
      ret = hid_get_manufacturer_string(hid, wstr, MAX_STR);
      printf("Manufacturer String: %ls\n", wstr);
      // Read the Product String
      ret = hid_get_product_string(hid, wstr, MAX_STR);
      printf("Product String: %ls\n", wstr);
      // Read the Serial Number String
      ret = hid_get_serial_number_string(hid, wstr, MAX_STR);
      printf("Serial Number String: %ls\n", wstr);
      break;            
    case 'c':
      printf("connect pin 21 and 20\n");
      usbInitCounter_USB1024LS(hid);
      flag = fcntl(fileno(stdin), F_GETFL);
      fcntl(0, F_SETFL, flag | O_NONBLOCK);
      do {
        usbDOut_USB1024LS(hid, DIO_PORTA, 1);
        usbDOut_USB1024LS(hid, DIO_PORTA, 0);
	printf("Counter = %d\n",usbReadCounter_USB1024LS(hid));
        usleep(500000);
      } while (!isalpha(getchar()));
      fcntl(fileno(stdin), F_SETFL, flag);
      break;
    case 'd':
      printf("\nTesting Digital I/O....\n");
      printf("connect pins 21 through 28 <=> 32 through 39 and pins 1-4 <==> 5-8\n");
      do {
        printf("Enter a byte number [0-0xff] : " );
        scanf("%x", &temp);
        usbDOut_USB1024LS(hid, DIO_PORTA,(uint8_t)temp);
        usbDIn_USB1024LS(hid, DIO_PORTB, &input);
        printf("The number you entered = %#x\n\n",input);
        printf("Enter a nibble [0-0xf] : " );
        scanf("%x", &temp);
        usbDOut_USB1024LS(hid, DIO_PORTC_LOW,(uint8_t)temp);
        usbDIn_USB1024LS(hid, DIO_PORTC_HI, &input);
        printf("The number you entered = %#x\n", input);
      } while (toContinue());
      break;
    case 'g':
      printf("\nGetting heat bits\n");
      usbDIn_USB1024LS(hid, DIO_PORTA, &input);
      printf("PORTA: %d ", input);
      printBits(sizeof(input), &input);
      printf("\n");
      usbDIn_USB1024LS(hid, DIO_PORTB, &input);
      printf("PORTB: %d ", input);
      printBits(sizeof(input), &input);
      printf("\n");
      break;
    case 'w':
      break;
    case 't':
      //reset the pin values
      usbDOut_USB1024LS(hid, DIO_PORTA,0x0);
      printf("\nTesting Bit  I/O....\n");
      printf("Enter a bit value for output (0 | 1) : ");
      scanf("%d", &temp);
      input = (uint8_t) temp;
      printf("Select the Pin in port A [0-7] :");
      scanf("%d", &temp);
      pin = (uint8_t) temp;
      usbDBitOut_USB1024LS(hid, DIO_PORTA, pin, input);
      usbDIn_USB1024LS(hid, DIO_PORTB, &input);
      printf("The number you entered 2^%d = %d \n", temp, input);
      break;
    case 'e':
      hid_close(hid);
      hid_exit();
      return 0;
      break;
    case 'r':
      usbReset_USB1024LS(hid);
      exit(0);
      break;
    case 'n':
      hid_get_serial_number_string(hid, serial, 64);
      printf("Serial Number = %ls\n", serial);
      break;
    default:
      break;
    }
  }//end while

  //printf("\nGetting heat bits\n");
  usbDIn_USB1024LS(hid, DIO_PORTA, &input);
  printf("PORTA: %d ", input);
  //printBits(sizeof(input), &input);
  printf("\n");
  usbDIn_USB1024LS(hid, DIO_PORTB, &input);
  printf("PORTB: %d ", input);
  //printBits(sizeof(input), &input);
  printf("\n");


}
