{\rtf1\ansi\ansicpg1252\cocoartf2868
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww30040\viewh18980\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs48 \cf0 package main\
\
import \'93fmt\'94\
\
func main()\{\
	\
\
\
\
\
\
\
\
\
	fmt.Print(\'93enter a temperature in farenheit\'94)\
	var input int\
	fmt.Scanf(\'93%f\'94, &input)\
	output := (input - 32) * 5/9\
	fmt.PrintLn(output)\
\
	fmt.Print(\'93enter a distance in feet\'94)\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 	var input int\
	fmt.Scanf(\'93%f\'94, &input)\
	output := input * 0.3048\
	fmt.PrintLn(output)\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 \}}