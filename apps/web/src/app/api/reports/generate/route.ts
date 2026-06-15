import { NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId');
    const examId = searchParams.get('examId');

    if (!studentId || !examId) {
      return NextResponse.json({ error: 'Missing studentId or examId' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Fetch student data
    const { data: student } = await supabase
      .from('students')
      .select('full_name, classes(name), sections(name)')
      .eq('id', studentId)
      .single();

    // Fetch marks data
    const { data: marks } = await supabase
      .from('marks')
      .select('*, exams(name, total_marks, passing_marks)')
      .eq('student_id', studentId)
      .eq('exam_id', examId)
      .single();

    // Generate PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    page.drawText('Student Report Card', {
      x: 50,
      y: 350,
      size: 24,
      font,
      color: rgb(0.1, 0.2, 0.6),
    });

    if (student) {
      page.drawText(`Name: ${student.full_name}`, { x: 50, y: 300, size: 14, font: regularFont });
      page.drawText(`Class: ${(student.classes as any)?.name} - ${(student.sections as any)?.name}`, { x: 50, y: 280, size: 14, font: regularFont });
    }

    if (marks) {
      page.drawText(`Exam: ${(marks.exams as any)?.name}`, { x: 50, y: 240, size: 16, font });
      page.drawText(`Marks Obtained: ${marks.is_absent ? 'ABSENT' : marks.marks_obtained}`, { x: 50, y: 210, size: 14, font: regularFont });
      page.drawText(`Total Marks: ${(marks.exams as any)?.total_marks}`, { x: 50, y: 190, size: 14, font: regularFont });
      
      const pass = marks.marks_obtained >= ((marks.exams as any)?.passing_marks || 0);
      page.drawText(`Result: ${marks.is_absent ? 'FAIL' : pass ? 'PASS' : 'FAIL'}`, { 
        x: 50, y: 160, size: 14, font,
        color: marks.is_absent ? rgb(0.8,0,0) : pass ? rgb(0,0.6,0) : rgb(0.8,0,0)
      });
      
      if (marks.remarks) {
        page.drawText(`Remarks: ${marks.remarks}`, { x: 50, y: 130, size: 12, font: regularFont, color: rgb(0.3,0.3,0.3) });
      }
    } else {
      page.drawText(`No marks recorded for this exam yet.`, { x: 50, y: 240, size: 14, font: regularFont });
    }

    const pdfBytes = await pdfDoc.save();

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report_${studentId}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('PDF Generation error:', error);
    return NextResponse.json(
      { error: 'PDF Generation failed', details: error.message },
      { status: 500 }
    );
  }
}
